package server

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// Maintained coverage for the Phase 0 parity gaps (docs/COMMERCIALIZATION_PHASE0_DIAGNOSIS.md
// section 4): friend prefs, conversation meta, read-all, leave, session revoke,
// self-data export, partner rich-menu read, and bot rules.

func newParityApp(t *testing.T, name string) (*App, *httptest.Server) {
	t.Helper()
	app, err := New(Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), name)),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	t.Cleanup(func() { srv.Close(); app.Close() })
	return app, srv
}

func parityLogin(t *testing.T, srv *httptest.Server, email, name string) *apiClient {
	t.Helper()
	c := &apiClient{t: t, srv: srv}
	if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
		"email": email, "password": "ParityPass#2026!", "display_name": name,
	}); st != 201 {
		t.Fatalf("register %s: %d %v", email, st, out)
	}
	st, out := c.req("POST", "/api/v1/auth/login", map[string]any{
		"email": email, "password": "ParityPass#2026!",
	})
	if st != 200 {
		t.Fatalf("login %s: %d %v", email, st, out)
	}
	c.token, _ = out["access_token"].(string)
	c.userID, _ = out["user_id"].(string)
	if c.token == "" {
		t.Fatalf("login %s returned no access_token: %v", email, out)
	}
	return c
}

func findByID(t *testing.T, list any, id string) map[string]any {
	t.Helper()
	items, ok := list.([]any)
	if !ok {
		t.Fatalf("expected list, got %T", list)
	}
	for _, it := range items {
		if m, ok := it.(map[string]any); ok && m["id"] == id {
			return m
		}
	}
	t.Fatalf("id %s not found in %v", id, list)
	return nil
}

func TestParityFriendPrefs(t *testing.T) {
	_, srv := newParityApp(t, "parity_friends.db")
	alice := parityLogin(t, srv, "pf-alice@example.test", "PF Alice")
	bob := parityLogin(t, srv, "pf-bob@example.test", "PF Bob")
	if st, out := alice.req("POST", "/api/v1/friends", map[string]any{"friend_id": bob.userID}); st != 201 && st != 200 {
		t.Fatalf("add friend: %d %v", st, out)
	}
	if st, out := alice.req("PATCH", "/api/v1/friends/"+bob.userID, map[string]any{"favorite": true}); st != 200 {
		t.Fatalf("favorite: %d %v", st, out)
	}
	if st, out := alice.req("PATCH", "/api/v1/friends/"+bob.userID, map[string]any{"blocked": true}); st != 200 {
		t.Fatalf("block: %d %v", st, out)
	}
	st, list := alice.req("GET", "/api/v1/friends", nil)
	if st != 200 {
		t.Fatalf("friends list: %d %v", st, list)
	}
	entry := findByID(t, list["friends"], bob.userID)
	if entry["is_favorite"] != true || entry["is_blocked"] != true {
		t.Fatalf("prefs not persisted: %v", entry)
	}
	if st, out := alice.req("PATCH", "/api/v1/friends/"+bob.userID, map[string]any{"favorite": false, "blocked": false}); st != 200 {
		t.Fatalf("unpref: %d %v", st, out)
	}
	st, list = alice.req("GET", "/api/v1/friends", nil)
	entry = findByID(t, list["friends"], bob.userID)
	if entry["is_favorite"] != false || entry["is_blocked"] != false {
		t.Fatalf("prefs not cleared: %v", entry)
	}
	// Negative cases.
	if st, _ := alice.req("PATCH", "/api/v1/friends/00000000-0000-0000-0000-000000000000", map[string]any{"favorite": true}); st != 404 {
		t.Fatalf("non-friend pref must 404, got %d", st)
	}
	if st, _ := alice.req("PATCH", "/api/v1/friends/"+alice.userID, map[string]any{"favorite": true}); st != 404 {
		t.Fatalf("self pref must 404, got %d", st)
	}
	if st, _ := alice.req("PATCH", "/api/v1/friends/"+bob.userID, map[string]any{}); st != 400 {
		t.Fatalf("empty pref must 400, got %d", st)
	}
}

func TestParityConversationMetaReadAllLeave(t *testing.T) {
	_, srv := newParityApp(t, "parity_meta.db")
	alice := parityLogin(t, srv, "pm-alice@example.test", "PM Alice")
	bob := parityLogin(t, srv, "pm-bob@example.test", "PM Bob")
	carol := parityLogin(t, srv, "pm-carol@example.test", "PM Carol")
	st, conv := alice.req("POST", "/api/v1/conversations", map[string]any{
		"kind": "group", "title": "Meta Group", "member_ids": []string{bob.userID},
	})
	if st != 201 {
		t.Fatalf("create group: %d %v", st, conv)
	}
	cid := conv["id"].(string)
	if st, out := alice.req("PATCH", "/api/v1/conversations/"+cid+"/meta", map[string]any{"pinned": true, "muted": true}); st != 200 {
		t.Fatalf("meta set: %d %v", st, out)
	}
	st, list := alice.req("GET", "/api/v1/conversations", nil)
	entry := findByID(t, list["conversations"], cid)
	if entry["pinned"] != true || entry["muted"] != true {
		t.Fatalf("meta not persisted: %v", entry)
	}
	if st, _ := carol.req("PATCH", "/api/v1/conversations/"+cid+"/meta", map[string]any{"pinned": true}); st != 404 {
		t.Fatalf("non-member meta must 404, got %d", st)
	}
	// Bob posts; Alice reads-all; unread drops to zero.
	if st, out := bob.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{"client_id": "parity-cli-001", "body": "hello meta"}); st != 201 && st != 200 {
		t.Fatalf("send: %d %v", st, out)
	}
	st, list = alice.req("GET", "/api/v1/conversations", nil)
	if entry = findByID(t, list["conversations"], cid); entry["unread_count"] == float64(0) {
		t.Fatalf("expected unread before read-all: %v", entry)
	}
	if st, out := alice.req("POST", "/api/v1/conversations/read-all", map[string]any{}); st != 200 {
		t.Fatalf("read-all: %d %v", st, out)
	}
	st, list = alice.req("GET", "/api/v1/conversations", nil)
	if entry = findByID(t, list["conversations"], cid); entry["unread_count"] != float64(0) {
		t.Fatalf("expected zero unread after read-all: %v", entry)
	}
	// Leave hides the conversation; leaving again 404s.
	if st, out := alice.req("DELETE", "/api/v1/conversations/"+cid, nil); st != 200 {
		t.Fatalf("leave: %d %v", st, out)
	}
	st, list = alice.req("GET", "/api/v1/conversations", nil)
	for _, it := range list["conversations"].([]any) {
		if it.(map[string]any)["id"] == cid {
			t.Fatalf("left conversation still listed: %v", list)
		}
	}
	if st, _ := alice.req("DELETE", "/api/v1/conversations/"+cid, nil); st != 404 {
		t.Fatalf("second leave must 404, got %d", st)
	}
}

func TestParitySessionRevoke(t *testing.T) {
	app, srv := newParityApp(t, "parity_revoke.db")
	alice := parityLogin(t, srv, "pr-alice@example.test", "PR Alice")
	var sid string
	if e := app.db.QueryRow("SELECT id FROM identity.sessions WHERE user_id=$1", alice.userID).Scan(&sid); e != nil {
		t.Fatalf("session row: %v", e)
	}
	st, out := alice.req("POST", "/api/v1/auth/sessions/revoke", map[string]any{"session_id": sid})
	if st != 200 || out["status"] != "revoked" || out["self"] != true {
		t.Fatalf("revoke self: %d %v", st, out)
	}
	if st, _ := alice.req("GET", "/api/v1/me", nil); st != 401 {
		t.Fatalf("revoked token must 401, got %d", st)
	}
	// Revoking another user's session must not leak existence.
	bob := parityLogin(t, srv, "pr-bob@example.test", "PR Bob")
	var bobSID string
	if e := app.db.QueryRow("SELECT id FROM identity.sessions WHERE user_id=$1", bob.userID).Scan(&bobSID); e != nil {
		t.Fatalf("bob session row: %v", e)
	}
	alice2 := parityLogin(t, srv, "pr-alice2@example.test", "PR Alice2")
	if st, _ := alice2.req("POST", "/api/v1/auth/sessions/revoke", map[string]any{"session_id": bobSID}); st != 404 {
		t.Fatalf("cross-user revoke must 404, got %d", st)
	}
	if st, _ := alice2.req("POST", "/api/v1/auth/sessions/revoke", map[string]any{"session_id": "not-a-uuid"}); st != 400 {
		t.Fatalf("malformed session must 400, got %d", st)
	}
}

func TestParityExportData(t *testing.T) {
	_, srv := newParityApp(t, "parity_export.db")
	alice := parityLogin(t, srv, "pe-alice@example.test", "PE Alice")
	bob := parityLogin(t, srv, "pe-bob@example.test", "PE Bob")
	if st, _ := alice.req("POST", "/api/v1/friends", map[string]any{"friend_id": bob.userID}); st != 201 && st != 200 {
		t.Fatalf("add friend: %d", st)
	}
	if st, _ := alice.req("POST", "/api/v1/conversations", map[string]any{"kind": "direct", "member_ids": []string{bob.userID}}); st != 201 {
		t.Fatalf("create direct: %d", st)
	}
	st, out := alice.req("GET", "/api/v1/me/export-data", nil)
	if st != 200 {
		t.Fatalf("export: %d %v", st, out)
	}
	stats, _ := out["stats"].(map[string]any)
	if stats == nil || stats["conversations_count"] != float64(1) || stats["friends_count"] != float64(1) {
		t.Fatalf("export stats: %v", out)
	}
	if user, _ := out["user"].(map[string]any); user == nil || user["email"] != "pe-alice@example.test" {
		t.Fatalf("export user: %v", out)
	}
	anon := &apiClient{t: t, srv: srv}
	if st, _ := anon.req("GET", "/api/v1/me/export-data", nil); st != 401 {
		t.Fatalf("anon export must 401, got %d", st)
	}
}

func TestParityPartnerMenusAndBotRules(t *testing.T) {
	_, srv := newParityApp(t, "parity_partner.db")
	alice := parityLogin(t, srv, "pp-alice@example.test", "PP Alice")
	bob := parityLogin(t, srv, "pp-bob@example.test", "PP Bob")
	st, org := alice.req("POST", "/api/v1/partner/organizations", map[string]any{"name": "Parity Corp", "country": "KR"})
	if st != 201 {
		t.Fatalf("create org: %d %v", st, org)
	}
	orgID := org["id"].(string)
	st, acc := alice.req("POST", "/api/v1/partner/organizations/"+orgID+"/accounts", map[string]any{"name": "Parity OA"})
	if st != 201 {
		t.Fatalf("create account: %d %v", st, acc)
	}
	accID := acc["id"].(string)
	// layout/tiles payload (console shape) must be accepted, not 400.
	tiles := []any{map[string]any{"id": "t1", "label": "Hi", "action": map[string]any{"type": "message", "text": "hi"}}}
	if st, out := alice.req("POST", "/api/v1/partner/accounts/"+accID+"/rich-menus", map[string]any{
		"title": "Main", "layout": "grid_1x3", "tiles": tiles, "enabled": true,
	}); st != 201 {
		t.Fatalf("create rich menu: %d %v", st, out)
	}
	st, menus := alice.req("GET", "/api/v1/partner/accounts/"+accID+"/rich-menus", nil)
	if st != 200 {
		t.Fatalf("list rich menus: %d %v", st, menus)
	}
	if rm, _ := menus["rich_menu"].(map[string]any); rm == nil || rm["title"] != "Main" || rm["layout"] != "grid_1x3" {
		t.Fatalf("rich menu shape: %v", menus)
	}
	if st, _ := bob.req("GET", "/api/v1/partner/accounts/"+accID+"/rich-menus", nil); st != 403 {
		t.Fatalf("non-member menu read must 403, got %d", st)
	}
	// Bot rules round-trip.
	st, created := alice.req("POST", "/api/v1/partner/accounts/"+accID+"/bot-rules", map[string]any{
		"keywords": []string{"hello", "hi"}, "reply": "Hello there", "match_type": "contains",
	})
	if st != 201 {
		t.Fatalf("create rule: %d %v", st, created)
	}
	ruleID := created["id"].(string)
	st, rules := alice.req("GET", "/api/v1/partner/accounts/"+accID+"/bot-rules", nil)
	rulesList, _ := rules["rules"].([]any)
	if st != 200 || len(rulesList) != 1 {
		t.Fatalf("list rules: %d %v", st, rules)
	}
	if r0 := rulesList[0].(map[string]any); r0["reply"] != "Hello there" {
		t.Fatalf("rule reply: %v", r0)
	}
	if st, _ := alice.req("POST", "/api/v1/partner/accounts/"+accID+"/bot-rules", map[string]any{"keywords": []string{}, "reply": "x"}); st != 400 {
		t.Fatalf("empty rule must 400, got %d", st)
	}
	if st, _ := alice.req("DELETE", "/api/v1/partner/accounts/"+accID+"/bot-rules/"+ruleID, nil); st != 200 {
		t.Fatalf("delete rule: %d", st)
	}
	st, rules = alice.req("GET", "/api/v1/partner/accounts/"+accID+"/bot-rules", nil)
	if len(rules["rules"].([]any)) != 0 {
		t.Fatalf("rules not empty after delete: %v", rules)
	}
}
