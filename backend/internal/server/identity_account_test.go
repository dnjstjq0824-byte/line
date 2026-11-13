package server

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestIdentityAccountLifecycle(t *testing.T) {
	cfg := Config{DSN: "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "identity.db")), Secret: "0123456789abcdef0123456789abcdef", Service: "gateway", RecoveryMailProvider: "mock"}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()

	c := &apiClient{t: t, srv: srv}
	if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{"email": "acct@example.test", "password": "OldStrongPass#2026!", "display_name": "Acct"}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	st, out := c.req("POST", "/api/v1/auth/login", map[string]any{"email": "acct@example.test", "password": "OldStrongPass#2026!", "platform": "web", "device_name": "test"})
	if st != 200 {
		t.Fatalf("login: %d %v", st, out)
	}
	c.token = out["access_token"].(string)

	// invalid change requests
	if st, _ := c.req("PATCH", "/api/v1/auth/password", map[string]any{"current_password": "wrong", "new_password": "NewStrongPass#2026!"}); st != 401 {
		t.Fatalf("wrong current password: %d", st)
	}
	if st, _ := c.req("PATCH", "/api/v1/auth/password", map[string]any{"current_password": "OldStrongPass#2026!", "new_password": "short"}); st != 400 {
		t.Fatalf("short new password: %d", st)
	}
	if st, out := c.req("PATCH", "/api/v1/auth/password", map[string]any{"current_password": "OldStrongPass#2026!", "new_password": "NewStrongPass#2026!"}); st != 200 || out["status"] != "password_changed" {
		t.Fatalf("change password: %d %v", st, out)
	}
	// current session remains usable
	if st, _ := c.req("GET", "/api/v1/me", nil); st != 200 {
		t.Fatalf("me after password change: %d", st)
	}
	// old password no longer works
	c2 := &apiClient{t: t, srv: srv}
	if st, _ := c2.req("POST", "/api/v1/auth/login", map[string]any{"email": "acct@example.test", "password": "OldStrongPass#2026!"}); st != 401 {
		t.Fatalf("old password login: %d", st)
	}
	// new password works
	if st, out := c2.req("POST", "/api/v1/auth/login", map[string]any{"email": "acct@example.test", "password": "NewStrongPass#2026!", "platform": "web", "device_name": "test"}); st != 200 {
		t.Fatalf("new password login: %d %v", st, out)
	}
	c2.token = out["access_token"].(string)

	// recovery (S1: the code is never in the response; the mock sender
	// delivers it out-of-band and the client returns it from there).
	st, out = c.req("POST", "/api/v1/auth/recover", map[string]any{"email": "acct@example.test"})
	if st != 202 || out["status"] != "recovery_token_sent_if_account_exists" {
		t.Fatalf("recover: %d %v", st, out)
	}
	challengeID, _ := out["challenge_id"].(string)
	if _, leaked := out["recovery_code"]; leaked || challengeID == "" {
		t.Fatalf("response must carry no code: %v", out)
	}
	if len(app.recoveryMailOutbox) != 1 {
		t.Fatalf("mock mail deliveries: %d", len(app.recoveryMailOutbox))
	}
	code := app.recoveryMailOutbox[0].Code
	// wrong code
	if st, _ := c.req("POST", "/api/v1/auth/recover/verify", map[string]any{"challenge_id": challengeID, "recovery_code": code + "x", "new_password": "RecoveredStrong#2026!"}); st != 401 {
		t.Fatalf("wrong recovery code: %d", st)
	}
	// correct code
	if st, out := c.req("POST", "/api/v1/auth/recover/verify", map[string]any{"challenge_id": challengeID, "recovery_code": code, "new_password": "RecoveredStrong#2026!"}); st != 200 || out["status"] != "password_reset" {
		t.Fatalf("verify recovery: %d %v", st, out)
	}
	// consumed challenge cannot be reused
	if st, _ := c.req("POST", "/api/v1/auth/recover/verify", map[string]any{"challenge_id": challengeID, "recovery_code": code, "new_password": "AnotherStrong#2026!"}); st != 401 {
		t.Fatalf("reused recovery challenge: %d", st)
	}
	// nonexistent email answers exactly like a known one (no enumeration):
	// same shape with a decoy challenge id, and no mail is delivered.
	st, out = c.req("POST", "/api/v1/auth/recover", map[string]any{"email": "missing@example.test"})
	decoy, _ := out["challenge_id"].(string)
	if st != 202 || decoy == "" || decoy == challengeID {
		t.Fatalf("missing account recovery: %d %v", st, out)
	}
	if _, leaked := out["recovery_code"]; leaked {
		t.Fatalf("response must carry no code: %v", out)
	}
	if len(app.recoveryMailOutbox) != 1 {
		t.Fatalf("no mail may be sent for an unknown email: %d", len(app.recoveryMailOutbox))
	}

	// login with recovered password
	st, out = c2.req("POST", "/api/v1/auth/login", map[string]any{"email": "acct@example.test", "password": "RecoveredStrong#2026!", "platform": "web", "device_name": "test"})
	if st != 200 {
		t.Fatalf("recovered password login: %d %v", st, out)
	}
	c2.token = out["access_token"].(string)
	if st, _ := c2.req("DELETE", "/api/v1/me", map[string]any{"password": "wrong"}); st != 401 {
		t.Fatalf("wrong delete password: %d", st)
	}
	if st, out := c2.req("DELETE", "/api/v1/me", map[string]any{"password": "RecoveredStrong#2026!"}); st != 200 || out["status"] != "account_deleted" {
		t.Fatalf("delete account: %d %v", st, out)
	}
	// login after deletion fails
	if st, _ := c2.req("POST", "/api/v1/auth/login", map[string]any{"email": "acct@example.test", "password": "RecoveredStrong#2026!"}); st != 401 {
		t.Fatalf("login after deletion: %d", st)
	}
	// authenticated access after deletion fails
	if st, _ := c2.req("GET", "/api/v1/me", nil); st != 401 {
		t.Fatalf("me after deletion: %d", st)
	}
}

func TestRecoveryFailsClosedWithoutMailProvider(t *testing.T) {
	cfg := Config{DSN: "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "identity_noprov.db")), Secret: "0123456789abcdef0123456789abcdef", Service: "gateway"}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()

	c := &apiClient{t: t, srv: srv}
	if st, _ := c.req("POST", "/api/v1/auth/register", map[string]any{"email": "norecover@example.test", "password": "OldStrongPass#2026!", "display_name": "NoRecover"}); st != 201 {
		t.Fatalf("register: %d", st)
	}
	// Known and unknown emails fail identically: 501, no code, no challenge.
	for _, email := range []string{"norecover@example.test", "ghost@example.test"} {
		st, out := c.req("POST", "/api/v1/auth/recover", map[string]any{"email": email})
		if st != 501 || out["code"] != "recovery_unavailable" {
			t.Fatalf("recover %s: %d %v", email, st, out)
		}
		if _, leaked := out["recovery_code"]; leaked {
			t.Fatalf("recover %s must carry no code: %v", email, out)
		}
		if _, present := out["challenge_id"]; present {
			t.Fatalf("recover %s must create no challenge: %v", email, out)
		}
	}
	if len(app.recoveryMailOutbox) != 0 {
		t.Fatalf("no mail may be delivered: %d", len(app.recoveryMailOutbox))
	}
}
