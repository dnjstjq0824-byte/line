package server

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestGroupMessagesCarrySenderName(t *testing.T) {
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "sender.db")),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()

	login := func(email, password, name, handle string) *apiClient {
		c := &apiClient{t: t, srv: srv}
		if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
			"email": email, "password": password, "display_name": name, "handle": handle,
		}); st != 201 {
			t.Fatalf("register %s: %d %v", email, st, out)
		}
		status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
			"email": email, "password": password,
		})
		if status != 200 {
			t.Fatalf("login %s: %d %v", email, status, result)
		}
		c.token = result["access_token"].(string)
		c.userID = result["user_id"].(string)
		return c
	}

	alice := login("alice-sender@example.test", "AliceStrongPass#2026!", "Alice Sender", "alice_sender")
	bob := login("bob-sender@example.test", "BobStrongPass#2026!", "Bob Sender", "bob_sender")

	st, conv := alice.req("POST", "/api/v1/conversations", map[string]any{
		"kind":       "group",
		"title":      "Room Name",
		"member_ids": []string{bob.userID},
	})
	if st != 201 {
		t.Fatalf("create group conv: %d %v", st, conv)
	}
	cid := conv["id"].(string)

	if st, out := alice.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{
		"client_id": "sender-cli-001",
		"kind":      "text",
		"body":      "hi all",
	}); st != 201 {
		t.Fatalf("send: %d %v", st, out)
	}

	st, listMsgs := bob.req("GET", "/api/v1/conversations/"+cid+"/messages", nil)
	if st != 200 {
		t.Fatalf("list messages: %d %v", st, listMsgs)
	}
	msgs := listMsgs["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	first := msgs[0].(map[string]any)
	if first["sender_name"] != "Alice Sender" {
		t.Fatalf("expected sender_name Alice Sender, got %v", first["sender_name"])
	}
}
