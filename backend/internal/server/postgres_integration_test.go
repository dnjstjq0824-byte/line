package server

import (
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
)

// TestPostgreSQLIntegration runs integration tests against a real PostgreSQL database.
// Set DATABASE_URL env var to enable. Skips if not set.
func TestPostgreSQLIntegration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set, skipping PostgreSQL integration tests")
	}
	cfg := Config{DSN: dsn, Secret: "0123456789abcdef0123456789abcdef", Service: "gateway"}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// Verify schema migrations
	var count int
	if err := app.db.QueryRow("SELECT count(*) FROM ops.schema_migrations").Scan(&count); err != nil {
		t.Fatalf("schema_migrations query failed: %v", err)
	}
	if count == 0 {
		t.Fatal("no schema migrations recorded")
	}

	// Verify core tables exist
	tables := []string{
		"identity.users", "chat.messages", "chat.conversations",
		"realtime.delivery_outbox", "realtime.push_queue",
		"chat.attachments", "chat.upload_sessions",
	}
	for _, table := range tables {
		var exists bool
		err := app.db.QueryRow("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema || '.' || table_name = $1)", table).Scan(&exists)
		if err != nil || !exists {
			t.Fatalf("table %s does not exist: %v", table, err)
		}
	}

	t.Log("PostgreSQL integration: schema and tables verified")
}

// TestPostgreSQLMessagePersistence exercises the message write path against a real
// PostgreSQL instance, where the guarantees SQLite cannot demonstrate actually apply:
// the SELECT ... FOR UPDATE sequence lock, encryption at rest, the transactional
// outbox, client_id idempotency and durability across a process restart.
func TestPostgreSQLMessagePersistence(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set, skipping PostgreSQL integration tests")
	}
	cfg := Config{DSN: dsn, Secret: "0123456789abcdef0123456789abcdef", Service: "gateway"}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	closed := false
	defer func() {
		if !closed {
			srv.Close()
			app.Close()
		}
	}()

	// Unique per run so the test is repeatable against a persistent database.
	suffix := fmt.Sprintf("%d", os.Getpid())
	email := "pg-persist-" + suffix + "@example.test"
	const password = "PgStrongPass#2026!"

	client := &apiClient{t: t, srv: srv}
	if st, out := client.req("POST", "/api/v1/auth/register", map[string]any{
		"email": email, "password": password, "display_name": "pg persist",
	}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	st, loginOut := client.req("POST", "/api/v1/auth/login", map[string]any{
		"email": email, "password": password, "platform": "web", "device_name": "test",
	})
	if st != 200 {
		t.Fatalf("login: %d %v", st, loginOut)
	}
	client.token = loginOut["access_token"].(string)

	st, conv := client.req("POST", "/api/v1/conversations", map[string]any{"kind": "self"})
	if st != 201 {
		t.Fatalf("conversation: %d %v", st, conv)
	}
	cid := conv["id"].(string)

	// --- 1. Sequence allocation under concurrency ---------------------------
	// chat.conversations.last_sequence is handed out under SELECT ... FOR UPDATE,
	// so concurrent senders must receive distinct, gapless sequences.
	const senders = 8
	var wg sync.WaitGroup
	seqs := make([]int64, senders)
	for i := 0; i < senders; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			c := &apiClient{t: t, srv: srv, token: client.token}
			status, out := c.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{
				"client_id": fmt.Sprintf("pg-concurrent-%s-%d", suffix, i),
				"kind":      "text",
				"body":      fmt.Sprintf("concurrent %d", i),
			})
			if status != 201 {
				t.Errorf("concurrent send %d: %d %v", i, status, out)
				return
			}
			m := out["message"].(map[string]any)
			seqs[i] = int64(m["sequence"].(float64))
		}(i)
	}
	wg.Wait()
	if t.Failed() {
		t.FailNow()
	}
	seen := map[int64]bool{}
	var maxSeq int64
	for i, s := range seqs {
		if s == 0 {
			t.Fatalf("sender %d got no sequence", i)
		}
		if seen[s] {
			t.Fatalf("sequence %d was handed out twice: the FOR UPDATE lock is not holding", s)
		}
		seen[s] = true
		if s > maxSeq {
			maxSeq = s
		}
	}
	for s := maxSeq - senders + 1; s <= maxSeq; s++ {
		if !seen[s] {
			t.Fatalf("gap in allocated sequences: %d missing from the %d sent", s, senders)
		}
	}

	// --- 2. client_id idempotency ------------------------------------------
	dupClientID := "pg-idempotent-" + suffix
	body := map[string]any{"client_id": dupClientID, "kind": "text", "body": "exactly once"}
	st, first := client.req("POST", "/api/v1/conversations/"+cid+"/messages", body)
	if st != 201 {
		t.Fatalf("first send: %d %v", st, first)
	}
	firstMsg := first["message"].(map[string]any)
	if first["duplicate"] != false {
		t.Fatalf("first send reported duplicate=%v", first["duplicate"])
	}
	st, second := client.req("POST", "/api/v1/conversations/"+cid+"/messages", body)
	if st != 200 {
		t.Fatalf("resend should be 200, got %d %v", st, second)
	}
	if second["duplicate"] != true {
		t.Fatalf("resend did not report duplicate=true: %v", second)
	}
	secondMsg := second["message"].(map[string]any)
	if secondMsg["id"] != firstMsg["id"] {
		t.Fatalf("resend minted a new message: %v vs %v", secondMsg["id"], firstMsg["id"])
	}
	var rows int
	if err := app.db.QueryRow(
		"SELECT count(*) FROM chat.messages WHERE conversation_id=$1 AND client_id=$2", cid, dupClientID,
	).Scan(&rows); err != nil {
		t.Fatalf("duplicate count query: %v", err)
	}
	if rows != 1 {
		t.Fatalf("expected exactly 1 stored row for a repeated client_id, found %d", rows)
	}

	// --- 3. Encryption at rest ---------------------------------------------
	// The handler stores a.msgCipher.encrypt(body); the plaintext must not be readable.
	var storedBody string
	if err := app.db.QueryRow(
		"SELECT body FROM chat.messages WHERE id=$1", firstMsg["id"],
	).Scan(&storedBody); err != nil {
		t.Fatalf("stored body query: %v", err)
	}
	if strings.Contains(storedBody, "exactly once") {
		t.Fatalf("message body is stored as plaintext in chat.messages: %q", storedBody)
	}

	// --- 4. Transactional outbox -------------------------------------------
	var outboxRows int
	if err := app.db.QueryRow(
		"SELECT count(*) FROM realtime.delivery_outbox WHERE message_id=$1 AND event_type='message.created'",
		firstMsg["id"],
	).Scan(&outboxRows); err != nil {
		t.Fatalf("outbox query: %v", err)
	}
	if outboxRows != 1 {
		t.Fatalf("expected 1 message.created outbox row, found %d", outboxRows)
	}

	// --- 5. Durability across a restart, and the decryption round-trip ------
	srv.Close()
	app.Close()
	closed = true

	app2, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv2 := httptest.NewServer(app2.Handler())
	defer func() { srv2.Close(); app2.Close() }()
	client.srv = srv2

	st, listed := client.req("GET", "/api/v1/conversations/"+cid+"/messages", nil)
	if st != 200 {
		t.Fatalf("list after restart: %d %v", st, listed)
	}
	items, ok := listed["messages"].([]any)
	if !ok {
		t.Fatalf("unexpected list shape: %v", listed)
	}
	found := false
	for _, it := range items {
		m := it.(map[string]any)
		if m["id"] == firstMsg["id"] {
			found = true
			// The ciphertext on disk must decrypt back to the original plaintext.
			if m["body"] != "exactly once" {
				t.Fatalf("body did not survive the encrypt/decrypt round-trip: %q", m["body"])
			}
		}
	}
	if !found {
		t.Fatalf("message %v did not survive the restart (%d messages listed)", firstMsg["id"], len(items))
	}
	t.Logf("PostgreSQL message persistence: %d concurrent sequences gapless, idempotency, at-rest encryption, outbox and restart durability verified", senders)
}
