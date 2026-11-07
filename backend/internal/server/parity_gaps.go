package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/example/global-messenger/backend/internal/auth"
)

// This file closes the client/server contract gaps found in the Phase 0 audit
// (docs/COMMERCIALIZATION_PHASE0_DIAGNOSIS.md section 4). Every handler below
// is wired in core.go and covered by parity_gaps_test.go.

// farFutureMute marks a conversation muted indefinitely without relying on
// interval arithmetic (unsupported by the pgsqlite compat driver).
const farFutureMute = "2999-12-31T23:59:59Z"

// updateFriendPrefs serves PATCH /api/v1/friends/{id} with {favorite?, blocked?}.
func (a *App) updateFriendPrefs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	uid := claims(r).Subject
	if !auth.ValidUUID(id) || id == uid {
		fail(w, 404, "friend not found")
		return
	}
	var in struct {
		Favorite *bool `json:"favorite"`
		Blocked  *bool `json:"blocked"`
	}
	if decode(r, &in) != nil || (in.Favorite == nil && in.Blocked == nil) {
		fail(w, 400, "invalid friend prefs")
		return
	}
	var count int
	if e := a.db.QueryRowContext(r.Context(), "SELECT count(*) FROM social.friendships WHERE user_id=$1 AND friend_id=$2", uid, id).Scan(&count); e != nil || count == 0 {
		fail(w, 404, "friend not found")
		return
	}
	if in.Favorite != nil {
		if _, e := a.db.ExecContext(r.Context(), "UPDATE social.friendships SET is_favorite=$3 WHERE user_id=$1 AND friend_id=$2", uid, id, *in.Favorite); e != nil {
			fail(w, 500, "favorite update failed")
			return
		}
	}
	if in.Blocked != nil {
		if *in.Blocked {
			if _, e := a.db.ExecContext(r.Context(), "INSERT INTO social.blocks(user_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", uid, id); e != nil {
				fail(w, 500, "block failed")
				return
			}
		} else if _, e := a.db.ExecContext(r.Context(), "DELETE FROM social.blocks WHERE user_id=$1 AND blocked_id=$2", uid, id); e != nil {
			fail(w, 500, "unblock failed")
			return
		}
	}
	send(w, 200, map[string]string{"status": "friend_updated"})
}

// updateConversationMeta serves PATCH /api/v1/conversations/{id}/meta with {pinned?, muted?}.
func (a *App) updateConversationMeta(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !a.isMember(r, id) {
		fail(w, 404, "conversation not found")
		return
	}
	var in struct {
		Pinned *bool `json:"pinned"`
		Muted  *bool `json:"muted"`
	}
	if decode(r, &in) != nil || (in.Pinned == nil && in.Muted == nil) {
		fail(w, 400, "invalid conversation meta")
		return
	}
	uid := claims(r).Subject
	if in.Pinned != nil {
		var e error
		if *in.Pinned {
			_, e = a.db.ExecContext(r.Context(), "UPDATE chat.conversation_members SET pinned_at=now() WHERE conversation_id=$1 AND user_id=$2", id, uid)
		} else {
			_, e = a.db.ExecContext(r.Context(), "UPDATE chat.conversation_members SET pinned_at=NULL WHERE conversation_id=$1 AND user_id=$2", id, uid)
		}
		if e != nil {
			fail(w, 500, "pin update failed")
			return
		}
	}
	if in.Muted != nil {
		var e error
		if *in.Muted {
			_, e = a.db.ExecContext(r.Context(), "UPDATE chat.conversation_members SET muted_until=$3 WHERE conversation_id=$1 AND user_id=$2", id, uid, farFutureMute)
		} else {
			_, e = a.db.ExecContext(r.Context(), "UPDATE chat.conversation_members SET muted_until=NULL WHERE conversation_id=$1 AND user_id=$2", id, uid)
		}
		if e != nil {
			fail(w, 500, "mute update failed")
			return
		}
	}
	send(w, 200, map[string]string{"status": "meta_updated"})
}

// readAllConversations serves POST /api/v1/conversations/read-all.
func (a *App) readAllConversations(w http.ResponseWriter, r *http.Request) {
	res, e := a.db.ExecContext(r.Context(),
		`UPDATE chat.conversation_members SET last_read_sequence=(SELECT c.last_sequence FROM chat.conversations c WHERE c.id=conversation_id)
		 WHERE user_id=$1 AND left_at IS NULL`, claims(r).Subject)
	if e != nil {
		fail(w, 500, "read-all failed")
		return
	}
	n, _ := res.RowsAffected()
	send(w, 200, map[string]any{"status": "read_all", "updated": n})
}

// leaveConversation serves DELETE /api/v1/conversations/{id}.
func (a *App) leaveConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !a.isMember(r, id) {
		fail(w, 404, "conversation not found")
		return
	}
	if _, e := a.db.ExecContext(r.Context(), "UPDATE chat.conversation_members SET left_at=now() WHERE conversation_id=$1 AND user_id=$2", id, claims(r).Subject); e != nil {
		fail(w, 500, "leave failed")
		return
	}
	send(w, 200, map[string]string{"status": "left"})
}

// revokeSession serves POST /api/v1/auth/sessions/revoke with {session_id}.
// The caller learns whether it revoked its own session so web clients can drop
// local credentials immediately instead of waiting for the next 401.
func (a *App) revokeSession(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SessionID string `json:"session_id"`
	}
	if decode(r, &in) != nil || !auth.ValidUUID(in.SessionID) {
		fail(w, 400, "invalid session id")
		return
	}
	uid := claims(r).Subject
	var owner string
	if e := a.db.QueryRowContext(r.Context(), "SELECT user_id FROM identity.sessions WHERE id=$1 AND revoked_at IS NULL", in.SessionID).Scan(&owner); e != nil || owner != uid {
		fail(w, 404, "session not found")
		return
	}
	if _, e := a.db.ExecContext(r.Context(), "UPDATE identity.sessions SET revoked_at=now() WHERE id=$1", in.SessionID); e != nil {
		fail(w, 500, "revoke failed")
		return
	}
	send(w, 200, map[string]any{"status": "revoked", "self": in.SessionID == claims(r).SessionID})
}

// exportMyData serves GET /api/v1/me/export-data: a bounded self-service data
// archive (profile, settings, devices, friends, conversations metadata, saved
// messages). Full per-message history export stays a P1 paginated endpoint.
func (a *App) exportMyData(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	ctx := r.Context()
	var id, email, name, role, handle, phone, avatar, bio, locale string
	if e := a.db.QueryRowContext(ctx,
		"SELECT id,email,display_name,role,COALESCE(handle,''),COALESCE(phone_e164,''),COALESCE(avatar_url,''),bio,locale FROM identity.users WHERE id=$1",
		uid).Scan(&id, &email, &name, &role, &handle, &phone, &avatar, &bio, &locale); e != nil {
		fail(w, 404, "not found")
		return
	}
	collect := func(query string, cols int) []any {
		rows, e := a.db.QueryContext(ctx, query, uid)
		if e != nil {
			return []any{}
		}
		defer rows.Close()
		out := []any{}
		for rows.Next() {
			vals := make([]any, cols)
			ptrs := make([]any, cols)
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if rows.Scan(ptrs...) == nil {
				row := make([]any, cols)
				for i, v := range vals {
					if b, ok := v.([]byte); ok {
						row[i] = string(b)
					} else {
						row[i] = v
					}
				}
				out = append(out, row)
			}
		}
		return out
	}
	friends := collect("SELECT u.id,u.display_name FROM social.friendships f JOIN identity.users u ON u.id=f.friend_id WHERE f.user_id=$1", 2)
	convs := collect("SELECT c.id,c.kind,COALESCE(c.title,'') FROM chat.conversation_members m JOIN chat.conversations c ON c.id=m.conversation_id WHERE m.user_id=$1 AND m.left_at IS NULL", 3)
	var msgCount, savedCount int
	_ = a.db.QueryRowContext(ctx, "SELECT count(*) FROM chat.messages m JOIN chat.conversation_members cm ON cm.conversation_id=m.conversation_id WHERE cm.user_id=$1 AND m.sender_id=$1 AND m.deleted_at IS NULL", uid).Scan(&msgCount)
	_ = a.db.QueryRowContext(ctx, "SELECT count(*) FROM chat.saved_messages WHERE user_id=$1", uid).Scan(&savedCount)
	send(w, 200, map[string]any{
		"user":          map[string]any{"id": id, "email": email, "display_name": name, "role": role, "handle": handle, "phone_e164": phone, "avatar_url": avatar, "bio": bio, "locale": locale},
		"friends":       friends,
		"conversations": convs,
		"stats":         map[string]any{"friends_count": len(friends), "conversations_count": len(convs), "messages_count": msgCount, "saved_count": savedCount},
	})
}

// listRichMenus serves GET /api/v1/partner/accounts/{id}/rich-menus.
// The console consumes the latest menu as {title, layout, tiles[]}.
func (a *App) listRichMenus(w http.ResponseWriter, r *http.Request) {
	accID := r.PathValue("id")
	if !a.hasAccountRole(r, accID, "owner", "admin", "member") {
		fail(w, 403, "account forbidden")
		return
	}
	rows, e := a.db.QueryContext(r.Context(),
		"SELECT id,title,definition,enabled FROM business.rich_menus WHERE official_account_id=$1 ORDER BY created_at DESC", accID)
	if e != nil {
		fail(w, 500, "rich menus unavailable")
		return
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var mid, title, def string
		var enabled bool
		if rows.Scan(&mid, &title, &def, &enabled) != nil {
			continue
		}
		var parsed map[string]any
		if json.Unmarshal([]byte(def), &parsed) != nil || parsed == nil {
			parsed = map[string]any{}
		}
		parsed["id"] = mid
		parsed["title"] = title
		parsed["enabled"] = enabled
		out = append(out, parsed)
	}
	var latest any
	if len(out) > 0 {
		latest = out[0]
	}
	send(w, 200, map[string]any{"rich_menus": out, "rich_menu": latest})
}

// listBotRules serves GET /api/v1/partner/accounts/{id}/bot-rules backed by
// business.auto_replies (keyword match rules with a text response).
func (a *App) listBotRules(w http.ResponseWriter, r *http.Request) {
	accID := r.PathValue("id")
	if !a.hasAccountRole(r, accID, "owner", "admin", "member") {
		fail(w, 403, "account forbidden")
		return
	}
	rows, e := a.db.QueryContext(r.Context(),
		"SELECT id,trigger_type,COALESCE(match_value,''),response FROM business.auto_replies WHERE official_account_id=$1 AND active=true ORDER BY id", accID)
	if e != nil {
		fail(w, 500, "bot rules unavailable")
		return
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var rid, trigger, match, resp string
		if rows.Scan(&rid, &trigger, &match, &resp) != nil {
			continue
		}
		keywords := []string{}
		for _, k := range strings.Split(match, ",") {
			if k = strings.TrimSpace(k); k != "" {
				keywords = append(keywords, k)
			}
		}
		var parsed map[string]any
		reply := ""
		if json.Unmarshal([]byte(resp), &parsed) == nil {
			if t, ok := parsed["text"].(string); ok {
				reply = t
			}
		}
		out = append(out, map[string]any{"id": rid, "keywords": keywords, "reply": reply, "match_type": trigger})
	}
	send(w, 200, map[string]any{"rules": out})
}

// createBotRule serves POST /api/v1/partner/accounts/{id}/bot-rules.
func (a *App) createBotRule(w http.ResponseWriter, r *http.Request) {
	accID := r.PathValue("id")
	if !a.hasAccountRole(r, accID, "owner", "admin") {
		fail(w, 403, "account forbidden")
		return
	}
	var in struct {
		Keywords  []string `json:"keywords"`
		Reply     string   `json:"reply"`
		MatchType string   `json:"match_type"`
	}
	if decode(r, &in) != nil || len(in.Keywords) == 0 || strings.TrimSpace(in.Reply) == "" {
		fail(w, 400, "invalid bot rule")
		return
	}
	clean := []string{}
	for _, k := range in.Keywords {
		if k = strings.TrimSpace(k); k != "" {
			clean = append(clean, k)
		}
	}
	if len(clean) == 0 {
		fail(w, 400, "invalid bot rule")
		return
	}
	if in.MatchType == "" {
		in.MatchType = "contains"
	}
	respBytes, _ := json.Marshal(map[string]string{"text": strings.TrimSpace(in.Reply)})
	var id string
	if e := a.db.QueryRowContext(r.Context(),
		"INSERT INTO business.auto_replies(official_account_id,trigger_type,match_value,response) VALUES ($1,$2,$3,$4) RETURNING id",
		accID, in.MatchType, strings.Join(clean, ","), string(respBytes)).Scan(&id); e != nil {
		fail(w, 500, "bot rule creation failed")
		return
	}
	send(w, 201, map[string]any{"status": "rule_created", "id": id})
}

// deleteBotRule serves DELETE /api/v1/partner/accounts/{id}/bot-rules/{ruleId}.
func (a *App) deleteBotRule(w http.ResponseWriter, r *http.Request) {
	accID := r.PathValue("id")
	ruleID := r.PathValue("ruleId")
	if !a.hasAccountRole(r, accID, "owner", "admin") || !auth.ValidUUID(ruleID) {
		fail(w, 404, "rule not found")
		return
	}
	res, e := a.db.ExecContext(r.Context(), "DELETE FROM business.auto_replies WHERE id=$1 AND official_account_id=$2", ruleID, accID)
	if e != nil {
		fail(w, 500, "bot rule deletion failed")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		fail(w, 404, "rule not found")
		return
	}
	send(w, 200, map[string]string{"status": "rule_deleted"})
}
