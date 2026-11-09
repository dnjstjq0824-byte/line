package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeLuno struct {
	posts   []map[string]any
	convID  string
	botID   string
	aliceID string
}

func (f *fakeLuno) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/api/v1/auth/login":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "tok", "user_id": f.botID, "device_id": "dev",
			})
		case r.URL.Path == "/api/v1/conversations":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"conversations": []any{map[string]any{"id": f.convID, "kind": "direct"}},
			})
		case strings.HasPrefix(r.URL.Path, "/api/v1/conversations/") && strings.HasSuffix(r.URL.Path, "/sync"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"messages": []any{
					map[string]any{"id": "m1", "sender_id": f.aliceID, "sequence": 7, "kind": "text", "body": "hello bot"},
					map[string]any{"id": "m2", "sender_id": "stranger", "sequence": 8, "kind": "text", "body": "spam"},
					map[string]any{"id": "m3", "sender_id": f.botID, "sequence": 9, "kind": "text", "body": "old reply"},
				},
				"last_sequence": 9,
			})
		case strings.HasSuffix(r.URL.Path, "/messages") && r.Method == "POST":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			f.posts = append(f.posts, body)
			w.WriteHeader(201)
			_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]any{"id": "r1"}})
		default:
			w.WriteHeader(404)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "nope"})
		}
	})
}

func testClient(srv *httptest.Server) *client {
	return &client{base: srv.URL, token: "tok", http: srv.Client()}
}

func TestRunOnceEchoRepliesOnlyToWhitelist(t *testing.T) {
	f := &fakeLuno{convID: "conv-1", botID: "bot", aliceID: "alice"}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	cfg := config{echo: true, whitelist: map[string]bool{"alice": true}}
	cursors := map[string]int64{}
	if err := runOnce(testClient(srv), cfg, "bot", cursors); err != nil {
		t.Fatal(err)
	}
	if len(f.posts) != 1 {
		t.Fatalf("expected exactly 1 reply, got %d", len(f.posts))
	}
	if f.posts[0]["body"] != "echo: hello bot" {
		t.Fatalf("unexpected reply body: %v", f.posts[0]["body"])
	}
	if cursors["conv-1"] != 9 {
		t.Fatalf("cursor must advance past all seen messages, got %d", cursors["conv-1"])
	}
}

func TestRunOnceLLMModeUsesChatAPI(t *testing.T) {
	f := &fakeLuno{convID: "conv-1", botID: "bot", aliceID: "alice"}
	luno := httptest.NewServer(f.handler())
	defer luno.Close()
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			w.WriteHeader(404)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": "llm says hi"}}},
		})
	}))
	defer llm.Close()
	cfg := config{llmBaseURL: llm.URL, llmKey: "k", llmModel: "test", whitelist: map[string]bool{"alice": true}}
	if err := runOnce(testClient(luno), cfg, "bot", map[string]int64{}); err != nil {
		t.Fatal(err)
	}
	if len(f.posts) != 1 || f.posts[0]["body"] != "llm says hi" {
		t.Fatalf("expected LLM reply, got %v", f.posts)
	}
}

func TestLoadConfigFailsClosed(t *testing.T) {
	t.Setenv("LUNO_BOT_EMAIL", "")
	t.Setenv("LUNO_BOT_PASSWORD", "")
	t.Setenv("LLM_API_KEY", "")
	if _, err := loadConfig(true); err == nil {
		t.Fatal("missing bot credentials must fail")
	}
	t.Setenv("LUNO_BOT_EMAIL", "bot@example.test")
	t.Setenv("LUNO_BOT_PASSWORD", "x")
	if _, err := loadConfig(false); err == nil {
		t.Fatal("missing LLM key without --echo must fail")
	}
	if _, err := loadConfig(true); err != nil {
		t.Fatalf("--echo without key must pass: %v", err)
	}
}

func TestEmptyWhitelistRepliesToNobody(t *testing.T) {
	f := &fakeLuno{convID: "conv-1", botID: "bot", aliceID: "alice"}
	srv := httptest.NewServer(f.handler())
	defer srv.Close()
	if err := runOnce(testClient(srv), config{echo: true, whitelist: map[string]bool{}}, "bot", map[string]int64{}); err != nil {
		t.Fatal(err)
	}
	if len(f.posts) != 0 {
		t.Fatalf("empty whitelist must reply to nobody, got %d posts", len(f.posts))
	}
}
