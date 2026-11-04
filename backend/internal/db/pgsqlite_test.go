package db

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestApplyAllPhasesSchema(t *testing.T) {
	conn, err := sql.Open("pgsqlite", "sqlite://file:test_schema?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open pgsqlite: %v", err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)

	schemaPath := filepath.Join("..", "..", "..", "database", "001_all_phases.sql")
	if err := ApplySchemaFile(context.Background(), conn, schemaPath); err != nil {
		t.Fatalf("ApplySchemaFile failed: %v", err)
	}

	var id string
	err = conn.QueryRow(`INSERT INTO identity.users(email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`,
		"alice@example.com", "hash123", "Alice").Scan(&id)
	if err != nil {
		t.Fatalf("insert user failed: %v", err)
	}
	if len(id) != 36 {
		t.Fatalf("expected UUID length 36, got %q", id)
	}
}

// This checks the local compatibility schema only; PostgreSQL upgrade and
// constraint semantics still require the PostgreSQL integration suite.
func TestAllMigrationTablesExistAndReplay(t *testing.T) {
	conn, err := sql.Open("pgsqlite", "sqlite://"+filepath.ToSlash(filepath.Join(t.TempDir(), "migrations.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	paths, err := filepath.Glob(filepath.Join("..", "..", "..", "database", "*.sql"))
	if err != nil || len(paths) != 5 {
		t.Fatalf("expected five migrations: %v %v", paths, err)
	}
	tables := map[string]bool{}
	pattern := regexp.MustCompile(`(?i)CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-z_]+\.[a-z_]+)`)
	for pass := 0; pass < 2; pass++ {
		for _, path := range paths {
			if err := ApplySchemaFile(context.Background(), conn, path); err != nil {
				t.Fatalf("pass %d migration %s: %v", pass, path, err)
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			for _, match := range pattern.FindAllStringSubmatch(string(data), -1) {
				tables[match[1]] = true
			}
		}
		if pass == 0 {
			if _, err := conn.Exec("INSERT INTO identity.users(email,password_hash,display_name) VALUES($1,$2,$3)", "migration@example.test", "test-only-hash", "기존 사용자 🌍"); err != nil {
				t.Fatal(err)
			}
		}
	}
	var name string
	if err := conn.QueryRow("SELECT display_name FROM identity.users WHERE email=$1", "migration@example.test").Scan(&name); err != nil || name != "기존 사용자 🌍" {
		t.Fatalf("migration replay changed existing Unicode data: %q %v", name, err)
	}
	for table := range tables {
		var count int
		if err := conn.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", strings.ReplaceAll(table, ".", "__")).Scan(&count); err != nil || count != 1 {
			t.Errorf("missing migration table %s: count=%d error=%v", table, count, err)
		}
	}
	t.Logf("verified %d distinct migration tables after two complete applications", len(tables))
}
