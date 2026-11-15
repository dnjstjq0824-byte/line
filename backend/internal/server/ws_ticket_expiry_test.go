package server

import (
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// F23: a ticket redeemed inside its final promised second is valid. Issued
// and compared in whole seconds, the old `expires <= now` check rejected it;
// `<` honours the full expires_in window.
func TestWSTicketHonoursFullWindow(t *testing.T) {
	app, err := New(Config{DSN: "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "ws_expiry.db")), Secret: "0123456789abcdef0123456789abcdef", Service: "gateway"})
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	srv := httptest.NewServer(app.Handler())
	defer srv.Close()
	c := &apiClient{t: t, srv: srv}
	if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{"email": "wsexp@example.test", "password": "WsExpiryStrong#2026!", "display_name": "WsExp"}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	st, login := c.req("POST", "/api/v1/auth/login", map[string]any{"email": "wsexp@example.test", "password": "WsExpiryStrong#2026!"})
	if st != 200 {
		t.Fatalf("login: %d %v", st, login)
	}
	c.token = login["access_token"].(string)

	st, ticketResp := c.req("POST", "/api/v1/ws-ticket", nil)
	if st != 200 {
		t.Fatalf("ws-ticket: %d %v", st, ticketResp)
	}
	ticket := ticketResp["ticket"].(string)
	// Pin the row to the boundary second: expires exactly now.
	if _, err := app.db.Exec("UPDATE realtime.ws_tickets SET expires_at_unix=$1 WHERE token_hash=$2", time.Now().Unix(), sha256hex(ticket)); err != nil {
		t.Fatalf("pin expiry: %v", err)
	}
	conn, resp, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http")+"/api/v1/ws?ticket="+ticket, nil)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("boundary-second ticket rejected (status %d): %v", status, err)
	}
	conn.Close()

	// One second past the promise the ticket is honestly expired.
	st, ticketResp = c.req("POST", "/api/v1/ws-ticket", nil)
	if st != 200 {
		t.Fatalf("ws-ticket: %d %v", st, ticketResp)
	}
	ticket = ticketResp["ticket"].(string)
	if _, err := app.db.Exec("UPDATE realtime.ws_tickets SET expires_at_unix=$1 WHERE token_hash=$2", time.Now().Unix()-1, sha256hex(ticket)); err != nil {
		t.Fatalf("age ticket: %v", err)
	}
	conn, resp, err = websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http")+"/api/v1/ws?ticket="+ticket, nil)
	if conn != nil {
		conn.Close()
	}
	if err == nil || resp == nil || resp.StatusCode != 401 {
		t.Fatal("expired ticket accepted")
	}
}
