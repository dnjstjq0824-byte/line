package server

import (
	"database/sql"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// consentInput builds the register/login consent body tests submit. Versions
// come from the same constants the gates enforce, so a bump never orphans
// the suite; cross-runtime drift (Go vs worker) fails loudly in node.
func consentInput() map[string]any {
	return map[string]any{"terms": legalTermsVersion, "privacy": legalPrivacyVersion}
}

func TestConsentGates(t *testing.T) {
	app, err := New(Config{DSN: "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "consent.db")), Secret: "0123456789abcdef0123456789abcdef", Service: "gateway"})
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	srv := httptest.NewServer(app.Handler())
	defer srv.Close()
	c := &apiClient{t: t, srv: srv}
	reg := func(email, birthdate string, consent any) (int, map[string]any) {
		body := map[string]any{"email": email, "password": "ConsentStrong#2026!", "display_name": "Consent"}
		if birthdate != "" {
			body["birthdate"] = birthdate
		}
		if consent != nil {
			body["consent"] = consent
		}
		return c.req("POST", "/api/v1/auth/register", body)
	}

	if st, out := reg("noconsent@example.test", "1990-01-01", nil); st != 400 || out["code"] != "CONSENT_REQUIRED" {
		t.Fatalf("missing consent: %d %v", st, out)
	}
	if st, out := reg("staleconsent@example.test", "1990-01-01", map[string]any{"terms": "0.0", "privacy": "0.0"}); st != 400 || out["code"] != "CONSENT_REQUIRED" {
		t.Fatalf("stale consent: %d %v", st, out)
	}
	if st, out := reg("nobirth@example.test", "", consentInput()); st != 400 || out["code"] != "BIRTHDATE_REQUIRED" {
		t.Fatalf("missing birthdate: %d %v", st, out)
	}
	if st, out := reg("underage@example.test", "2020-01-01", consentInput()); st != 403 || out["code"] != "UNDERAGE" {
		t.Fatalf("underage: %d %v", st, out)
	}
	if st, _ := reg("ok@example.test", "1990-01-01", consentInput()); st != 201 {
		t.Fatalf("valid signup: %d", st)
	}
	// The birthdate verified age and was never stored.
	var birthday string
	if err := app.db.QueryRow("SELECT birthday FROM identity.users WHERE email='ok@example.test'").Scan(&birthday); err != nil || birthday != "" {
		t.Fatalf("birthdate leaked into profile: %q %v", birthday, err)
	}
	var age14 sql.NullBool
	var terms, privacy string
	if err := app.db.QueryRow("SELECT terms_version,privacy_version,age14_confirmed FROM identity.consents WHERE user_id=(SELECT id FROM identity.users WHERE email='ok@example.test')").Scan(&terms, &privacy, &age14); err != nil {
		t.Fatalf("consent row missing: %v", err)
	}
	if terms != legalTermsVersion || privacy != legalPrivacyVersion || !age14.Valid || !age14.Bool {
		t.Fatalf("consent row wrong: %v %v %v", terms, privacy, age14)
	}

	// A version bump re-gates login until fresh consent rides along.
	c.token = ""
	if _, err := app.db.Exec("UPDATE identity.consents SET terms_version='0.0' WHERE user_id=(SELECT id FROM identity.users WHERE email='ok@example.test')"); err != nil {
		t.Fatal(err)
	}
	st, out := c.req("POST", "/api/v1/auth/login", map[string]any{"email": "ok@example.test", "password": "ConsentStrong#2026!"})
	if st != 403 || out["code"] != "CONSENT_STALE" {
		t.Fatalf("stale login: %d %v", st, out)
	}
	st, _ = c.req("POST", "/api/v1/auth/login", map[string]any{"email": "ok@example.test", "password": "ConsentStrong#2026!", "consent": consentInput()})
	if st != 200 {
		t.Fatalf("re-consent login: %d", st)
	}
}

func TestAgeOnDate(t *testing.T) {
	today := "2026-11-15"
	cases := []struct {
		birth string
		want  int
	}{
		{"2012-11-15", 14}, // birthday today: exactly 14
		{"2012-11-16", 13}, // birthday tomorrow: still 13
		{"1990-01-01", 36},
		{"2026-11-15", 0},
		{"2026-11-16", -1}, // future
		{"2012-02-30", -1}, // impossible
		{"2012-13-01", -1},
		{"not-a-date", -1},
		{"", -1},
	}
	for _, tc := range cases {
		if got := ageOnDate(tc.birth, today); got != tc.want {
			t.Fatalf("ageOnDate(%q) = %d, want %d", tc.birth, got, tc.want)
		}
	}
}
