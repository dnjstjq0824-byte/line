package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// Fake LUNO queue server: one mention job, sync with the real contract
// (since_sequence in, delta_messages out), message posts and completions.
type fakeLuno struct {
	posts     []map[string]any
	completes []map[string]any
	claimed   bool
	convID    string
	botID     string
	aliceID   string
}

func (f *fakeLuno) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/api/v1/bot/jobs/claim":
			if f.claimed {
				_ = json.NewEncoder(w).Encode(map[string]any{"job": nil})
				return
			}
			f.claimed = true
			_ = json.NewEncoder(w).Encode(map[string]any{"job": map[string]any{
				"id": "job-1", "bot_id": f.botID, "room_id": f.convID, "kind": "mention",
				"payload": map[string]any{"message_id": "m1", "author_id": f.aliceID, "body": "hello bot"},
			}})
		case strings.HasPrefix(r.URL.Path, "/api/v1/conversations/") && strings.HasSuffix(r.URL.Path, "/sync"):
			if _, ok := r.URL.Query()["since_sequence"]; !ok {
				w.WriteHeader(400)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": "since_sequence required"})
				return
			}
			if _, ok := r.URL.Query()["after_sequence"]; ok {
				w.WriteHeader(400)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": "after_sequence is not a thing"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"delta_messages": []any{
					map[string]any{"id": "m1", "sender_id": f.aliceID, "sequence": 7, "kind": "text", "body": "hello bot"},
				},
				"latest_sequence": 7,
			})
		case strings.HasSuffix(r.URL.Path, "/messages") && r.Method == "POST":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			f.posts = append(f.posts, body)
			w.WriteHeader(201)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "r1"})
		case strings.HasSuffix(r.URL.Path, "/complete") && r.Method == "POST":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			f.completes = append(f.completes, body)
			_ = json.NewEncoder(w).Encode(map[string]any{"status": body["status"]})
		default:
			w.WriteHeader(404)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "nope"})
		}
	})
}

func testClient(srv *httptest.Server) *client {
	return &client{base: srv.URL, token: "cf-bot-test", http: srv.Client()}
}

func TestClaimCycleEchoRepliesAndCompletes(t *testing.T) {
	f := &fakeLuno{convID: "conv-1", botID: "bot", aliceID: "alice"}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	cfg := config{whitelist: map[string]bool{"alice": true}}
	if err := runClaimCycle(testClient(srv), cfg, echoProvider{}); err != nil {
		t.Fatal(err)
	}
	if len(f.posts) != 1 {
		t.Fatalf("expected exactly 1 reply, got %d", len(f.posts))
	}
	if f.posts[0]["body"] != "echo: hello bot" {
		t.Fatalf("unexpected reply body: %v", f.posts[0]["body"])
	}
	if f.posts[0]["reply_to"] != "m1" {
		t.Fatalf("reply must thread to the mention, got %v", f.posts[0]["reply_to"])
	}
	if len(f.completes) != 1 || f.completes[0]["status"] != "done" {
		t.Fatalf("expected one done complete, got %v", f.completes)
	}
	usage, _ := f.completes[0]["usage"].(map[string]any)
	if usage == nil {
		t.Fatalf("complete must report usage, got %v", f.completes[0])
	}
	if err := runClaimCycle(testClient(srv), cfg, echoProvider{}); err != nil {
		t.Fatal(err)
	}
	if len(f.posts) != 1 {
		t.Fatalf("empty queue must not reply, got %d posts", len(f.posts))
	}
}

func TestClaimCycleSkipsNonWhitelistedAuthor(t *testing.T) {
	f := &fakeLuno{convID: "conv-1", botID: "bot", aliceID: "alice"}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	cfg := config{whitelist: map[string]bool{"someone-else": true}}
	if err := runClaimCycle(testClient(srv), cfg, echoProvider{}); err != nil {
		t.Fatal(err)
	}
	if len(f.posts) != 0 {
		t.Fatalf("non-whitelisted author must get no reply, got %d", len(f.posts))
	}
	if len(f.completes) != 1 || f.completes[0]["status"] != "done" {
		t.Fatalf("skipped job completes done, got %v", f.completes)
	}
}

func TestMaskTextPatterns(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"email", "mail me at jane.doe@example.com please", "mail me at [EMAIL] please"},
		{"email-plus", "a+b@luno-test.local", "[EMAIL]"},
		{"phone-dash", "call 010-1234-5678 now", "call [PHONE] now"},
		{"phone-intl", "call +82 10 1234 5678 now", "call [PHONE] now"},
		{"phone-paren", "(02) 123 4567", "[PHONE]"},
		{"card-dash", "card 1234-5678-9012-3456", "card [CARD]"},
		{"card-plain", "card 1234567890123456", "card [CARD]"},
		{"labeled-key", "api_key: AbC123_xyz-9", "[KEY]"},
		{"bearer", "Authorization Bearer tok_abc.def-ghi", "Authorization [KEY]"},
		{"cf-bot", "use cf-bot-550e8400-e29b-41d4", "use [TOKEN]"},
		{"cf-token", "cf-token-abc123.def456", "[TOKEN]"},
		{"sk", "sk-abcdefgh12345678", "[TOKEN]"},
		{"password-en", "my password: s3cr3t!", "my [PASSWORD]"},
		{"password-ko", "비밀번호=hunter2", "[PASSWORD]"},
		{"plain", "hello bot, how are you?", "hello bot, how are you?"},
		{"short-numbers", "room 101, 3 people, 2026", "room 101, 3 people, 2026"},
		{"date", "2026-11-14 meeting", "2026-11-14 meeting"},
		{"mention", "@helper_bot help", "@helper_bot help"},
	}
	for _, tc := range cases {
		if got := maskText(tc.in); got != tc.want {
			t.Errorf("%s: got %q want %q", tc.name, got, tc.want)
		}
	}
}

func TestFakeProviderReportsReplyAndTokens(t *testing.T) {
	reply, tokens, err := fakeProvider{}.complete("hello there")
	if err != nil {
		t.Fatal(err)
	}
	if reply == "" || tokens <= 0 {
		t.Fatalf("fake must report a reply and tokens, got %q %d", reply, tokens)
	}
}

func TestSelectProviderDefaultsEchoKeepsOpenAIOff(t *testing.T) {
	p, err := selectProvider(config{provider: ""})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := p.(echoProvider); !ok {
		t.Fatalf("default provider must be echo, got %T", p)
	}
	if _, err := selectProvider(config{provider: "openai"}); err == nil {
		t.Fatal("openai without a key must fail")
	}
	if _, err := selectProvider(config{provider: "Muse"}); err == nil {
		t.Fatal("unknown providers must fail")
	}
	if _, err := selectProvider(config{provider: "openai", llmKey: "k"}); err != nil {
		t.Fatalf("explicit openai with key must pass: %v", err)
	}
}

func TestLoadConfigFailsClosed(t *testing.T) {
	t.Setenv("LUNO_BOT_TOKEN", "")
	t.Setenv("LLM_PROVIDER", "")
	if _, err := loadConfig(true); err == nil {
		t.Fatal("missing bot token must fail")
	}
	t.Setenv("LUNO_BOT_TOKEN", "cf-bot-x")
	if _, err := loadConfig(true); err != nil {
		t.Fatalf("--echo with token must pass: %v", err)
	}
	t.Setenv("LLM_PROVIDER", "openai")
	t.Setenv("LLM_API_KEY", "")
	if _, err := loadConfig(false); err == nil {
		t.Fatal("openai without key must fail")
	}
}

// TestLiveFakeExchange runs the fake provider against a real local server.
// Needs LUNO_E2E_BASE (harness URL) and LUNO_E2E_ADMIN_TOKEN; skipped
// otherwise. It registers a user, issues a bot, opens a room, allowlists,
// mentions, runs one claim cycle, and expects a posted reply.
func TestLiveFakeExchange(t *testing.T) {
	base := os.Getenv("LUNO_E2E_BASE")
	adminTok := os.Getenv("LUNO_E2E_ADMIN_TOKEN")
	if base == "" || adminTok == "" {
		t.Skip("set LUNO_E2E_BASE and LUNO_E2E_ADMIN_TOKEN for the live exchange")
	}
	admin := &client{base: strings.TrimSuffix(base, "/"), token: adminTok, http: http.DefaultClient}
	mkuser := func(email string) (id, token string) {
		t.Helper()
		st, out, err := admin.call("POST", "/api/v1/auth/register", map[string]any{
			"email": email, "password": "E2e!Passw0rd", "display_name": "e2e",
		})
		if err != nil || (st != 201 && st != 409) {
			t.Fatalf("register %s: %d %v %v", email, st, out, err)
		}
		st, out, err = admin.call("POST", "/api/v1/auth/login", map[string]any{
			"email": email, "password": "E2e!Passw0rd",
		})
		if err != nil || st != 200 {
			t.Fatalf("login %s: %d %v %v", email, st, out, err)
		}
		return out["user_id"].(string), out["access_token"].(string)
	}
	userID, userTok := mkuser("l08e2e@luno-test.local")
	user := &client{base: admin.base, token: userTok, http: http.DefaultClient}
	st, out, err := admin.call("POST", "/api/v1/admin/bots", map[string]any{
		"display_name": "E2E Bot", "handle": "l08e2ebot",
	})
	if err != nil || (st != 201 && st != 409) {
		t.Fatalf("issue bot: %d %v %v", st, out, err)
	}
	botID := ""
	if st == 201 {
		botID = out["id"].(string)
	} else {
		st, out, err = admin.call("POST", "/api/v1/admin/bots", map[string]any{
			"display_name": "E2E Bot",
		})
		if err != nil || st != 201 {
			t.Fatalf("issue auto bot: %d %v %v", st, out, err)
		}
		botID = out["id"].(string)
	}
	st, out, err = user.call("POST", "/api/v1/conversations", map[string]any{
		"kind": "group", "title": "E2E Room", "member_ids": []any{botID},
	})
	if err != nil || st != 201 {
		t.Fatalf("create room: %d %v %v", st, out, err)
	}
	roomID := out["id"].(string)
	for _, add := range []map[string]any{
		{"kind": "room", "ref_id": roomID},
		{"kind": "user", "ref_id": userID},
	} {
		if st, _, err := admin.call("POST", "/api/v1/admin/llm/allowlist", add); err != nil || (st != 201 && st != 200) {
			t.Fatalf("allowlist %v: %d %v", add, st, err)
		}
	}
	st, out, err = admin.call("POST", "/api/v1/admin/bots/"+botID+"/tokens", map[string]any{
		"rooms": []any{roomID}, "ops": []any{"read", "post"},
	})
	if err != nil || st != 201 {
		t.Fatalf("mint token: %d %v %v", st, out, err)
	}
	botTok := out["token"].(string)
	st, _, err = user.call("POST", "/api/v1/conversations/"+roomID+"/messages", map[string]any{
		"body": "hey bot", "metadata": map[string]any{"mentions": []any{botID}},
	})
	if err != nil || st != 201 {
		t.Fatalf("mention: %d %v", st, err)
	}
	bot := &client{base: admin.base, token: botTok, http: http.DefaultClient}
	cfg := config{whitelist: map[string]bool{userID: true}}
	if err := runClaimCycle(bot, cfg, fakeProvider{}); err != nil {
		t.Fatalf("claim cycle: %v", err)
	}
	st, out, err = user.call("GET", "/api/v1/conversations/"+roomID+"/messages", nil)
	if err != nil || st != 200 {
		t.Fatalf("read back: %d %v", st, err)
	}
	msgs, _ := out["messages"].([]any)
	found := false
	for _, raw := range msgs {
		m, _ := raw.(map[string]any)
		if m == nil {
			continue
		}
		if m["sender_id"] == botID && strings.Contains(str(m["body"]), "가짜") {
			found = true
		}
	}
	if !found {
		t.Fatalf("fake reply not posted by the bot: %v", out)
	}
}
