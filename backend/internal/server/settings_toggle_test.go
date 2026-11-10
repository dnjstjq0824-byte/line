package server

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestSearchableByIdToggleRoundtrip(t *testing.T) {
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "settings.db")),
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
		"email": "set-toggle@example.test", "password": "SetTogglePass#2026!", "display_name": "Setter",
	}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
		"email": "set-toggle@example.test", "password": "SetTogglePass#2026!",
	})
	if status != 200 {
		t.Fatalf("login: %d %v", status, result)
	}
	c.token = result["access_token"].(string)

	st, got := c.req("GET", "/api/v1/me/settings", nil)
	if st != 200 {
		t.Fatalf("get settings: %d %v", st, got)
	}
	if got["searchable_by_id"] != true {
		t.Fatalf("expected searchable_by_id default true, got %v", got)
	}
	st, updated := c.req("PUT", "/api/v1/me/settings", map[string]any{
		"searchable_by_id": false,
	})
	if st != 200 {
		t.Fatalf("put settings: %d %v", st, updated)
	}
	if updated["searchable_by_id"] != false {
		t.Fatalf("expected searchable_by_id false, got %v", updated)
	}
	st, again := c.req("GET", "/api/v1/me/settings", nil)
	if st != 200 || again["searchable_by_id"] != false {
		t.Fatalf("expected persisted false, got %d %v", st, again)
	}
}
