package server

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestSystemHealthUsesPerInstanceOutboxDelivery(t *testing.T) {
	app, err := New(Config{DSN: "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "health.db")), Secret: "0123456789abcdef0123456789abcdef", Service: "gateway"})
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	app.relayCancel() // Drain explicitly so the backlog assertion is deterministic.
	srv := httptest.NewServer(app.Handler())
	defer srv.Close()
	c := &apiClient{t: t, srv: srv}
	if st, body := c.req("POST", "/api/v1/auth/register", map[string]any{"email": "health@example.test", "password": "HealthStrong#2026!", "display_name": "Health"}); st != 201 {
		t.Fatalf("register: %d %v", st, body)
	}
	_, session := c.req("POST", "/api/v1/auth/login", map[string]any{"email": "health@example.test", "password": "HealthStrong#2026!", "device_name": "health", "platform": "web"})
	c.token = session["access_token"].(string)
	_, conv := c.req("POST", "/api/v1/conversations", map[string]any{"kind": "self"})
	if st, body := c.req("POST", "/api/v1/conversations/"+conv["id"].(string)+"/messages", map[string]any{"client_id": "health-message-0001", "kind": "text", "body": "persisted health event"}); st != 201 {
		t.Fatalf("send: %d %v", st, body)
	}
	assertPending := func(want float64) {
		t.Helper()
		_, body := c.req("GET", "/api/v1/system/health", nil)
		outbox := body["checks"].(map[string]any)["outbox"].(map[string]any)
		if outbox["pending"] != want || outbox["status"] != "healthy" {
			t.Fatalf("outbox: %v, want %v", outbox, want)
		}
	}
	assertPending(1)
	app.drainOutbox(context.Background())
	assertPending(0)
	app.instanceID = "another-instance"
	assertPending(1)
	if _, err := app.db.Exec("DROP TABLE realtime.outbox_deliveries"); err != nil {
		t.Fatal(err)
	}
	_, body := c.req("GET", "/api/v1/system/health", nil)
	outbox := body["checks"].(map[string]any)["outbox"].(map[string]any)
	if body["status"] != "degraded" || outbox["pending"] != nil || outbox["status"] != "unhealthy" {
		t.Fatalf("failed query reported healthy: %v", body)
	}
}
