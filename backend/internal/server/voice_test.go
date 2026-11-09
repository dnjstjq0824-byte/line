package server

import (
	"encoding/base64"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestVoiceMessageFlow(t *testing.T) {
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "voice.db")),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()

	mkUser := func(email, password, name string) *apiClient {
		c := &apiClient{t: t, srv: srv}
		if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
			"email": email, "password": password, "display_name": name,
		}); st != 201 {
			t.Fatalf("register: %d %v", st, out)
		}
		status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
			"email": email, "password": password,
		})
		if status != 200 {
			t.Fatalf("login: %d %v", status, result)
		}
		c.token = result["access_token"].(string)
		c.userID = result["user_id"].(string)
		return c
	}
	alice := mkUser("alice-voice@example.test", "AliceVoice#2026!", "Alice Voice")
	bob := mkUser("bob-voice@example.test", "BobVoice#2026!", "Bob Voice")
	if st, out := alice.req("POST", "/api/v1/friends", map[string]any{"friend_id": bob.userID}); st != 201 {
		t.Fatalf("add friend: %d %v", st, out)
	}
	st, conv := alice.req("POST", "/api/v1/conversations", map[string]any{
		"kind": "direct", "title": "Voice Room", "member_ids": []string{bob.userID},
	})
	if st != 201 {
		t.Fatalf("create conv: %d %v", st, conv)
	}
	cid := conv["id"].(string)

	raw := []byte("fake-audio-bytes")
	st, up := alice.req("POST", "/api/v1/attachments", map[string]any{
		"conversation_id": cid, "original_name": "voice.m4a", "mime_type": "audio/mp4",
		"size_bytes": len(raw), "content_base64": base64.StdEncoding.EncodeToString(raw),
	})
	if st != 201 {
		t.Fatalf("upload audio: %d %v", st, up)
	}
	st, sent := alice.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{
		"client_id": "voice-cli-0001", "kind": "voice",
		"metadata": map[string]any{"attachment_id": up["id"], "duration": 42},
	})
	if st != 201 {
		t.Fatalf("send voice: %d %v", st, sent)
	}
	st, list := alice.req("GET", "/api/v1/conversations/"+cid+"/messages", nil)
	if st != 200 {
		t.Fatalf("list messages: %d %v", st, list)
	}
	found := false
	for _, m := range list["messages"].([]any) {
		row := m.(map[string]any)
		if row["kind"] == "voice" {
			found = true
			meta := row["metadata"].(map[string]any)
			if meta["attachment_id"] != up["id"] {
				t.Fatalf("voice metadata must link attachment: %v", meta)
			}
		}
	}
	if !found {
		t.Fatalf("voice message missing: %v", list)
	}
}
