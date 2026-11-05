package server

import (
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestConversationSearchFindsEncryptedHistoryAndProtectsMembership(t *testing.T) {
	app, err := New(Config{DSN: "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "search.db")), Secret: "0123456789abcdef0123456789abcdef", Service: "gateway"})
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	srv := httptest.NewServer(app.Handler())
	defer srv.Close()
	login := func(email string) *apiClient {
		c := &apiClient{t: t, srv: srv}
		if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{"email": email, "password": "SearchStrong#2026!", "display_name": email}); st != 201 {
			t.Fatalf("register: %d %v", st, out)
		}
		st, out := c.req("POST", "/api/v1/auth/login", map[string]any{"email": email, "password": "SearchStrong#2026!"})
		if st != 200 {
			t.Fatal(out)
		}
		c.token = out["access_token"].(string)
		return c
	}
	owner, outsider := login("search-owner@example.test"), login("search-other@example.test")
	_, room := owner.req("POST", "/api/v1/conversations", map[string]any{"kind": "self"})
	cid := room["id"].(string)
	st, sent := owner.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{"client_id": "search-sensitive-first", "kind": "text", "body": "Needle Secret 50%"})
	if st != 201 {
		t.Fatal(sent)
	}
	mid := sent["message"].(map[string]any)["id"].(string)
	var stored string
	if err := app.db.QueryRow("SELECT body FROM chat.messages WHERE id=$1", mid).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, "Needle") {
		t.Fatal("body is not encrypted")
	}
	for i := 0; i < 55; i++ {
		if st, out := owner.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{"client_id": fmt.Sprintf("search-newer-%04d", i), "kind": "text", "body": "unrelated content"}); st != 201 {
			t.Fatalf("send: %d %v", st, out)
		}
	}
	for _, query := range []string{"needle", "%25"} {
		st, out := owner.req("GET", "/api/v1/conversations/"+cid+"/search?q="+query, nil)
		if st != 200 {
			t.Fatal(out)
		}
		results := out["results"].([]any)
		if len(results) != 1 || results[0].(map[string]any)["body"] != "Needle Secret 50%" {
			t.Fatalf("query %s: %v", query, out)
		}
	}
	if st, _ := outsider.req("GET", "/api/v1/conversations/"+cid+"/search?q=needle", nil); st != 403 {
		t.Fatalf("outsider: %d", st)
	}
	if st, out := owner.req("DELETE", "/api/v1/conversations/"+cid+"/messages/"+mid, nil); st != 200 {
		t.Fatal(out)
	}
	_, out := owner.req("GET", "/api/v1/conversations/"+cid+"/search?q=needle", nil)
	if len(out["results"].([]any)) != 0 {
		t.Fatalf("deleted result leaked: %v", out)
	}
}
