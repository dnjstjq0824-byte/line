// LUNO agent sidecar (@muse). Polls the messenger server for new direct
// messages from whitelisted users and replies via an OpenAI-compatible
// chat API. --echo runs the full poll/reply loop without any LLM key.
// Standard library only: go run . / go build ./...
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type config struct {
	baseURL    string
	email      string
	password   string
	whitelist  map[string]bool
	pollEvery  time.Duration
	echo       bool
	llmBaseURL string
	llmKey     string
	llmModel   string
	cursorFile string
}

func loadConfig(echoFlag bool) (config, error) {
	c := config{
		baseURL:    envOr("LUNO_BASE_URL", "http://localhost:8080"),
		email:      os.Getenv("LUNO_BOT_EMAIL"),
		password:   os.Getenv("LUNO_BOT_PASSWORD"),
		whitelist:  map[string]bool{},
		echo:       echoFlag,
		llmBaseURL: strings.TrimSuffix(envOr("LLM_BASE_URL", "https://api.openai.com/v1"), "/"),
		llmKey:     os.Getenv("LLM_API_KEY"),
		llmModel:   envOr("LLM_MODEL", "gpt-4o-mini"),
		cursorFile: envOr("AGENT_CURSOR_FILE", "cursors.json"),
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
	if c.email == "" || c.password == "" {
		return c, fmt.Errorf("LUNO_BOT_EMAIL and LUNO_BOT_PASSWORD are required")
	}
	if !c.echo && c.llmKey == "" {
		return c, fmt.Errorf("LLM_API_KEY is required (or run with --echo)")
	}
	return c, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
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

func login(c *client, email, password string) (userID string, err error) {
	st, out, err := c.call("POST", "/api/v1/auth/login", map[string]any{
		"email": email, "password": password, "platform": "bot", "device_name": "muse-sidecar",
	})
	if err != nil {
		return "", err
	}
	if st != 200 {
		return "", fmt.Errorf("login status %d: %v", st, out["error"])
	}
	token, _ := out["access_token"].(string)
	userID, _ = out["user_id"].(string)
	if token == "" || userID == "" {
		return "", fmt.Errorf("login response missing token/user_id")
	}
	c.token = token
	return userID, nil
}

type message struct {
	ID       string
	SenderID string
	Sequence int64
	Kind     string
	Body     string
}

func syncMessages(c *client, convID string, after int64) ([]message, error) {
	st, out, err := c.call("GET", "/api/v1/conversations/"+convID+"/sync?after_sequence="+strconv.FormatInt(after, 10), nil)
	if err != nil {
		return nil, err
	}
	if st != 200 {
		return nil, fmt.Errorf("sync status %d", st)
	}
	var msgs []message
	for _, raw := range toSlice(out["messages"]) {
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

func listConversations(c *client) ([]string, error) {
	st, out, err := c.call("GET", "/api/v1/conversations", nil)
	if err != nil {
		return nil, err
	}
	if st != 200 {
		return nil, fmt.Errorf("conversations status %d", st)
	}
	var ids []string
	for _, raw := range toSlice(out["conversations"]) {
		m, _ := raw.(map[string]any)
		if m == nil {
			continue
		}
		if id := str(m["id"]); id != "" {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func postMessage(c *client, convID, body string) error {
	st, out, err := c.call("POST", "/api/v1/conversations/"+convID+"/messages", map[string]any{
		"client_id": "muse-" + strconv.FormatInt(time.Now().UnixNano(), 10),
		"kind":      "text",
		"body":      body,
	})
	if err != nil {
		return err
	}
	if st != 201 {
		return fmt.Errorf("post status %d: %v", st, out["error"])
	}
	return nil
}

func chatComplete(c *client, cfg config, text string) (string, error) {
	if cfg.echo {
		return "echo: " + text, nil
	}
	req, err := http.NewRequest("POST", cfg.llmBaseURL+"/chat/completions", bytes.NewReader(mustJSON(map[string]any{
		"model":    cfg.llmModel,
		"messages": []map[string]string{{"role": "user", "content": text}},
	})))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.llmKey)
	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if res.StatusCode >= 300 || len(out.Choices) == 0 {
		return "", fmt.Errorf("llm status %d", res.StatusCode)
	}
	return out.Choices[0].Message.Content, nil
}

// runOnce polls every conversation and replies to new whitelisted text
// messages. Cursors advance past every seen message, replied or not.
func runOnce(c *client, cfg config, botID string, cursors map[string]int64) error {
	ids, err := listConversations(c)
	if err != nil {
		return err
	}
	for _, id := range ids {
		msgs, err := syncMessages(c, id, cursors[id])
		if err != nil {
			return err
		}
		for _, m := range msgs {
			if m.Sequence > cursors[id] {
				cursors[id] = m.Sequence
			}
			if m.Kind != "text" || m.Body == "" || m.SenderID == botID || !cfg.whitelist[m.SenderID] {
				continue
			}
			reply, err := chatComplete(c, cfg, m.Body)
			if err != nil {
				return err
			}
			if err := postMessage(c, id, reply); err != nil {
				return err
			}
		}
	}
	return nil
}

func loadCursors(path string) map[string]int64 {
	cursors := map[string]int64{}
	raw, err := os.ReadFile(path)
	if err != nil {
		return cursors
	}
	_ = json.Unmarshal(raw, &cursors)
	return cursors
}

func saveCursors(path string, cursors map[string]int64) {
	raw, err := json.Marshal(cursors)
	if err != nil {
		return
	}
	_ = os.WriteFile(path, raw, 0600)
}

func main() {
	echoFlag := flag.Bool("echo", false, "reply with echo instead of calling an LLM (no key needed)")
	onceFlag := flag.Bool("once", false, "single poll cycle, then exit")
	flag.Parse()
	cfg, err := loadConfig(*echoFlag)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	c := &client{base: strings.TrimSuffix(cfg.baseURL, "/"), http: &http.Client{Timeout: 20 * time.Second}}
	botID, err := login(c, cfg.email, cfg.password)
	if err != nil {
		fmt.Fprintln(os.Stderr, "login:", err)
		os.Exit(1)
	}
	cursors := loadCursors(cfg.cursorFile)
	for {
		if err := runOnce(c, cfg, botID, cursors); err != nil {
			fmt.Fprintln(os.Stderr, "poll:", err)
		} else {
			saveCursors(cfg.cursorFile, cursors)
		}
		if *onceFlag {
			return
		}
		time.Sleep(cfg.pollEvery)
	}
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
