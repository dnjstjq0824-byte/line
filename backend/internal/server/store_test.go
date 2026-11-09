package server

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestStoreCatalogListsPublishedPacks(t *testing.T) {
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "store.db")),
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
		"email": "alice-store@example.test", "password": "AliceStore#2026!", "display_name": "Alice Store",
	}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
		"email": "alice-store@example.test", "password": "AliceStore#2026!",
	})
	if status != 200 {
		t.Fatalf("login: %d %v", status, result)
	}
	c.token = result["access_token"].(string)

	st, out := c.req("GET", "/api/v1/store/stickers", nil)
	if st != 200 {
		t.Fatalf("catalog: %d %v", st, out)
	}
	if packs, _ := out["packs"].([]any); len(packs) != 0 {
		t.Fatalf("fresh catalog must be empty: %v", out)
	}

	if st, _ := c.req("POST", "/api/v1/creator/profile", map[string]any{"display_name": "Alice Studio"}); st != 200 {
		t.Fatalf("creator profile: %d", st)
	}
	st, packResp := c.req("POST", "/api/v1/creator/packs", map[string]any{"title": "Cute Bear Stickers", "price_minor": 2500, "currency": "KRW"})
	if st != 201 {
		t.Fatalf("creator pack: %d %v", st, packResp)
	}

	st, out = c.req("GET", "/api/v1/store/stickers", nil)
	if st != 200 {
		t.Fatalf("catalog: %d %v", st, out)
	}
	packs, _ := out["packs"].([]any)
	if len(packs) != 1 {
		t.Fatalf("want 1 pack: %v", out)
	}
	row := packs[0].(map[string]any)
	if row["id"] != packResp["id"] || row["title"] != "Cute Bear Stickers" {
		t.Fatalf("pack mapping wrong: %v", row)
	}
	if row["price_minor"] != float64(2500) || row["currency"] != "KRW" {
		t.Fatalf("pack pricing wrong: %v", row)
	}
	if _, ok := row["description"]; !ok {
		t.Fatalf("pack lacks description: %v", row)
	}

	anon := &apiClient{t: t, srv: srv}
	if st, _ := anon.req("GET", "/api/v1/store/stickers", nil); st != 401 {
		t.Fatalf("anonymous catalog: want 401, got %d", st)
	}
}
