package server

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestInvalidSecretsFailBeforeDatabaseCreation(t *testing.T) {
	for _, tc := range []struct {
		name, secret, encryption, want string
	}{
		{"missing JWT secret", "", "", "JWT_SECRET"},
		{"short JWT secret", "short", strings.Repeat("k", 32), "JWT_SECRET"},
		{"short encryption key", strings.Repeat("s", 32), "short", "message encryption configuration"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// A nonexistent directory ensures validation must precede DB setup.
			cfg := Config{DSN: "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "absent", "test.db")), Secret: tc.secret, MessageEncryptionKey: tc.encryption}
			app, err := New(cfg)
			if app != nil {
				app.Close()
				t.Fatal("invalid secret configuration started the application")
			}
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q configuration error, got %v", tc.want, err)
			}
		})
	}
}
