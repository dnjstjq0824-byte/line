// LUNO agent sidecar. Claims mention jobs from the messenger server queue
// (L-07), answers through a pluggable LLM provider, and completes the job.
// Auth is a bot scope token (L-06); password login cannot work for bots.
// Providers: echo (default), fake (fixed reply + token counts for tests),
// openai (explicit opt-in only, off by default). Standard library only.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type config struct {
	baseURL    string
	botToken   string
	whitelist  map[string]bool
	pollEvery  time.Duration
	provider   string
	llmBaseURL string
	llmKey     string
	llmModel   string
}

func loadConfig(echoFlag bool) (config, error) {
	c := config{
		baseURL:    envOr("LUNO_BASE_URL", "http://localhost:8080"),
		botToken:   os.Getenv("LUNO_BOT_TOKEN"),
		whitelist:  map[string]bool{},
		provider:   envOr("LLM_PROVIDER", "echo"),
		llmBaseURL: strings.TrimSuffix(envOr("LLM_BASE_URL", "https://api.openai.com/v1"), "/"),
		llmKey:     os.Getenv("LLM_API_KEY"),
		llmModel:   envOr("LLM_MODEL", "gpt-4o-mini"),
	}
	if echoFlag {
		c.provider = "echo"
	}
	for _, id := range strings.Split(os.Getenv("LUNO_WHITELIST"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			c.whitelist[id] = true
		}
	}
	secs := 5
	if raw := os.Getenv("AGENT_POLL_SECONDS"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			return c, fmt.Errorf("bad AGENT_POLL_SECONDS %q", raw)
		}
		secs = n
	}
	c.pollEvery = time.Duration(secs) * time.Second
	if c.botToken == "" {
		return c, fmt.Errorf("LUNO_BOT_TOKEN is required (bot scope token, not a password)")
	}
	if _, err := selectProvider(c); err != nil {
		return c, err
	}
	return c, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// llmProvider answers one prompt. tokens is the provider-reported usage
// (fake providers report made-up counts so cost caps stay testable).
type llmProvider interface {
	complete(text string) (reply string, tokens int, err error)
}

type echoProvider struct{}

func (echoProvider) complete(text string) (string, int, error) {
	return "echo: " + text, 0, nil
}

type fakeProvider struct{}

func (fakeProvider) complete(text string) (string, int, error) {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) > 120 {
		trimmed = trimmed[:120]
	}
	return "LUNO 봇 응답(가짜): " + trimmed, len(text)/4 + 8, nil
}

type openaiProvider struct {
	baseURL string
	key     string
	model   string
	http    *http.Client
}

func (p openaiProvider) complete(text string) (string, int, error) {
	req, err := http.NewRequest("POST", p.baseURL+"/chat/completions", bytes.NewReader(mustJSON(map[string]any{
		"model":    p.model,
		"messages": []map[string]string{{"role": "user", "content": text}},
	})))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.key)
	res, err := p.http.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", 0, err
	}
	if res.StatusCode >= 300 || len(out.Choices) == 0 {
		return "", 0, fmt.Errorf("llm status %d", res.StatusCode)
	}
	return out.Choices[0].Message.Content, out.Usage.TotalTokens, nil
}

// selectProvider resolves LLM_PROVIDER. Only echo and fake are available
// without extra credentials; the OpenAI-compatible path stays off unless
// explicitly selected with a key. No other providers exist by design.
func selectProvider(cfg config) (llmProvider, error) {
	switch cfg.provider {
	case "", "echo":
		return echoProvider{}, nil
	case "fake":
		return fakeProvider{}, nil
	case "openai":
		if cfg.llmKey == "" {
			return nil, fmt.Errorf("LLM_API_KEY is required for LLM_PROVIDER=openai")
		}
		return openaiProvider{baseURL: cfg.llmBaseURL, key: cfg.llmKey, model: cfg.llmModel, http: &http.Client{Timeout: 60 * time.Second}}, nil
	default:
		return nil, fmt.Errorf("unknown LLM_PROVIDER %q (want echo, fake, or openai)", cfg.provider)
	}
}

type client struct {
	base  string
	token string
	http  *http.Client
}

func (c *client) call(method, path string, body any) (int, map[string]any, error) {
	var rdr io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		rdr = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, c.base+path, rdr)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return res.StatusCode, nil, fmt.Errorf("bad json: %w", err)
	}
	return res.StatusCode, out, nil
}

type job struct {
	ID        string
	BotID     string
	RoomID    string
	Kind      string
	MessageID string
	AuthorID  string
	Body      string
}

func claimJob(c *client) (*job, error) {
	st, out, err := c.call("POST", "/api/v1/bot/jobs/claim", map[string]any{})
	if err != nil {
		return nil, err
	}
	if st != 200 {
		return nil, fmt.Errorf("claim status %d: %v", st, out["error"])
	}
	raw, _ := out["job"].(map[string]any)
	if raw == nil {
		return nil, nil
	}
	payload, _ := raw["payload"].(map[string]any)
	if payload == nil {
		payload = map[string]any{}
	}
	return &job{
		ID:        str(raw["id"]),
		BotID:     str(raw["bot_id"]),
		RoomID:    str(raw["room_id"]),
		Kind:      str(raw["kind"]),
		MessageID: str(payload["message_id"]),
		AuthorID:  str(payload["author_id"]),
		Body:      str(payload["body"]),
	}, nil
}

func completeJob(c *client, id, status string, result map[string]any, errText string, tokens int) error {
	body := map[string]any{"status": status, "usage": map[string]any{"tokens": tokens}}
	if result != nil {
		body["result"] = result
	}
	if errText != "" {
		body["error"] = errText
	}
	st, out, err := c.call("POST", "/api/v1/bot/jobs/"+id+"/complete", body)
	if err != nil {
		return err
	}
	if st != 200 {
		return fmt.Errorf("complete status %d: %v", st, out["error"])
	}
	return nil
}

type message struct {
	ID       string
	SenderID string
	Sequence int64
	Kind     string
	Body     string
}

// syncMessages reads the room delta after a cursor. The server contract is
// since_sequence in, delta_messages out (M2/L-08).
func syncMessages(c *client, convID string, since int64) ([]message, error) {
	st, out, err := c.call("GET", "/api/v1/conversations/"+convID+"/sync?since_sequence="+strconv.FormatInt(since, 10), nil)
	if err != nil {
		return nil, err
	}
	if st != 200 {
		return nil, fmt.Errorf("sync status %d", st)
	}
	var msgs []message
	for _, raw := range toSlice(out["delta_messages"]) {
		m, _ := raw.(map[string]any)
		if m == nil {
			continue
		}
		if unsent, _ := m["unsent"].(bool); unsent {
			continue
		}
		msgs = append(msgs, message{
			ID:       str(m["id"]),
			SenderID: str(m["sender_id"]),
			Sequence: num(m["sequence"]),
			Kind:     str(m["kind"]),
			Body:     str(m["body"]),
		})
	}
	return msgs, nil
}

func postMessage(c *client, convID, body, replyTo string) (string, error) {
	payload := map[string]any{
		"client_id": "muse-" + strconv.FormatInt(time.Now().UnixNano(), 10),
		"kind":      "text",
		"body":      body,
	}
	if replyTo != "" {
		payload["reply_to"] = replyTo
	}
	st, out, err := c.call("POST", "/api/v1/conversations/"+convID+"/messages", payload)
	if err != nil {
		return "", err
	}
	if st != 201 {
		return "", fmt.Errorf("post status %d: %v", st, out["error"])
	}
	if id := str(out["id"]); id != "" {
		return id, nil
	}
	if nested, _ := out["message"].(map[string]any); nested != nil {
		return str(nested["id"]), nil
	}
	return "", fmt.Errorf("post response missing id")
}

// runClaimCycle claims one job and works it to completion: mention jobs
// re-read the mentioned message for fresh context, answer through the LLM
// provider, post the reply, and complete the job. Empty queue returns nil.
func runClaimCycle(c *client, cfg config, llm llmProvider) error {
	j, err := claimJob(c)
	if err != nil {
		return err
	}
	if j == nil {
		return nil
	}
	if j.Kind != "mention" {
		return completeJob(c, j.ID, "failed", nil, "unknown job kind "+j.Kind, 0)
	}
	if j.AuthorID == j.BotID {
		return completeJob(c, j.ID, "done", map[string]any{"skipped": "self mention"}, "", 0)
	}
	if len(cfg.whitelist) > 0 && !cfg.whitelist[j.AuthorID] {
		return completeJob(c, j.ID, "done", map[string]any{"skipped": "author not whitelisted"}, "", 0)
	}
	body := j.Body
	msgs, err := syncMessages(c, j.RoomID, 0)
	if err != nil {
		return completeJob(c, j.ID, "failed", nil, "sync: "+err.Error(), 0)
	}
	found := false
	for _, m := range msgs {
		if m.ID == j.MessageID {
			body = m.Body
			found = true
			break
		}
	}
	if !found {
		return completeJob(c, j.ID, "failed", nil, "message not found", 0)
	}
	reply, tokens, err := llm.complete(maskText(body))
	if err != nil {
		return completeJob(c, j.ID, "failed", nil, "llm: "+err.Error(), 0)
	}
	replyID, err := postMessage(c, j.RoomID, reply, j.MessageID)
	if err != nil {
		return completeJob(c, j.ID, "failed", nil, "post: "+err.Error(), tokens)
	}
	return completeJob(c, j.ID, "done", map[string]any{"reply_id": replyID, "tokens": tokens}, "", tokens)
}

func main() {
	echoFlag := flag.Bool("echo", false, "reply with echo instead of the configured provider (no key needed)")
	onceFlag := flag.Bool("once", false, "single claim cycle, then exit")
	flag.Parse()
	cfg, err := loadConfig(*echoFlag)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	llm, err := selectProvider(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	c := &client{base: strings.TrimSuffix(cfg.baseURL, "/"), token: cfg.botToken, http: &http.Client{Timeout: 20 * time.Second}}
	for {
		if err := runClaimCycle(c, cfg, llm); err != nil {
			fmt.Fprintln(os.Stderr, "cycle:", err)
		}
		if *onceFlag {
			return
		}
		time.Sleep(cfg.pollEvery)
	}
}

// L-10: secret masking. Everything addressed to the LLM passes through
// here first: emails, phone numbers, card numbers, API key/token shapes,
// and password phrases are replaced with markers. Deliberately
// conservative — unknown shapes pass through rather than corrupting text.
var (
	maskPassword   = regexp.MustCompile(`(?i)(password|passwd|pwd|비밀번호|비번)\s*[:=]\s*\S+`)
	maskLabeledKey = regexp.MustCompile(`(?i)(api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|client[_-]?secret)\s*[:=]\s*[\w\-.~+/=]+|bearer\s+[\w\-.~+/=]+`)
	maskKnownToken = regexp.MustCompile(`\b(cf-bot-[A-Za-z0-9-]+|cf-token-[A-Za-z0-9-.]+|cf-refresh-[A-Za-z0-9-]+|sk-[A-Za-z0-9]{8,}|rk-[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+)\b`)
	maskEmail      = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	maskCard       = regexp.MustCompile(`\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b`)
	maskPhone      = regexp.MustCompile(`\(?\+?[\d][\d\s\-.()]{7,}[\d]`)
)

func digitCount(s string) int {
	n := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			n++
		}
	}
	return n
}

func maskText(text string) string {
	out := maskPassword.ReplaceAllString(text, "[PASSWORD]")
	out = maskLabeledKey.ReplaceAllString(out, "[KEY]")
	out = maskKnownToken.ReplaceAllString(out, "[TOKEN]")
	out = maskEmail.ReplaceAllString(out, "[EMAIL]")
	out = maskCard.ReplaceAllString(out, "[CARD]")
	return maskPhone.ReplaceAllStringFunc(out, func(m string) string {
		if digitCount(m) < 9 {
			return m
		}
		return "[PHONE]"
	})
}

func toSlice(v any) []any {
	s, _ := v.([]any)
	return s
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func num(v any) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case json.Number:
		i, _ := n.Int64()
		return i
	default:
		return 0
	}
}

func mustJSON(v any) []byte {
	raw, _ := json.Marshal(v)
	return raw
}
