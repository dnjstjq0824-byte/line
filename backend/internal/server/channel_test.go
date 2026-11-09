package server

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestChannelSlotServesActiveNotice(t *testing.T) {
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "channel.db")),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()

	c := &apiClient{t: t, srv: srv}
	if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
		"email": "alice-channel@example.test", "password": "AliceChannel#2026!", "display_name": "Alice Channel",
	}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
		"email": "alice-channel@example.test", "password": "AliceChannel#2026!",
	})
	if status != 200 {
		t.Fatalf("login: %d %v", status, result)
	}
	c.token = result["access_token"].(string)

	st, out := c.req("GET", "/api/v1/channel/slot", nil)
	if st != 200 {
		t.Fatalf("slot: %d %v", st, out)
	}
	slot, ok := out["slot"].(map[string]any)
	if !ok {
		t.Fatalf("slot missing: %v", out)
	}
	for _, k := range []string{"id", "title", "body"} {
		if s, _ := slot[k].(string); s == "" {
			t.Fatalf("slot.%s must be non-empty: %v", k, slot)
		}
	}

	anon := &apiClient{t: t, srv: srv}
	if st, _ := anon.req("GET", "/api/v1/channel/slot", nil); st != 401 {
		t.Fatalf("anonymous slot: want 401, got %d", st)
	}
}
