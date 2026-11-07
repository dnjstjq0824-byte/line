package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/example/global-messenger/backend/internal/auth"
)

func (a *App) listPublicOfficialAccounts(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT oa.id, oa.name, COALESCE(oa.description,''), COALESCE(oa.avatar_url,''), oa.status,
		        EXISTS(SELECT 1 FROM business.contacts c WHERE c.official_account_id=oa.id AND c.user_id=$1 AND c.opted_in=true)
		 FROM business.official_accounts oa ORDER BY oa.created_at DESC LIMIT 50`, uid)
	out := make([]any, 0)
	if e == nil {
		defer rows.Close()
		for rows.Next() {
			var id, name, desc, avatar, status string
			var followed bool
			if rows.Scan(&id, &name, &desc, &avatar, &status, &followed) == nil {
				out = append(out, map[string]any{
					"id":          id,
					"name":        name,
					"handle":      "@" + strings.ToLower(strings.ReplaceAll(name, " ", "_")),
					"category":    "공식계정",
					"verified":    true,
					"followers":   "12.5만",
					"bio":         desc,
					"description": desc,
					"avatar_url":  avatar,
					"status":      status,
					"followed":    followed,
				})
			}
		}
	}
	send(w, 200, map[string]any{"accounts": out})
}

func (a *App) followOfficialAccount(w http.ResponseWriter, r *http.Request) {
	accID := r.PathValue("id")
	if !auth.ValidUUID(accID) {
		fail(w, 400, "invalid official account id")
		return
	}
	uid := claims(r).Subject
	var id string
	e := a.db.QueryRowContext(r.Context(),
		`INSERT INTO business.contacts(official_account_id,user_id,opted_in) VALUES($1,$2,true)
		 ON CONFLICT(official_account_id,user_id) DO UPDATE SET opted_in = NOT business.contacts.opted_in
		 RETURNING id`, accID, uid).Scan(&id)
	if e != nil {
		fail(w, 500, "follow update failed")
		return
	}
	send(w, 200, map[string]any{"id": id, "official_account_id": accID, "status": "updated"})
}

func (a *App) ensureWallet(r *http.Request, userID string) (int64, int64) {
	_, _ = a.db.ExecContext(r.Context(),
		`INSERT INTO commerce.wallets(user_id,balance,points) VALUES($1,125000,3450) ON CONFLICT(user_id) DO NOTHING`,
		userID)
	var balance, points int64
	_ = a.db.QueryRowContext(r.Context(),
		`SELECT balance, points FROM commerce.wallets WHERE user_id=$1`, userID).Scan(&balance, &points)
	return balance, points
}

func (a *App) getWallet(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	balance, points := a.ensureWallet(r, uid)
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT id, kind, title, amount, COALESCE(CAST(counterpart_id AS TEXT),''), created_at
		 FROM commerce.wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, uid)
	txs := make([]any, 0)
	if e == nil {
		defer rows.Close()
		for rows.Next() {
			var id, kind, title, cp string
			var amt int64
			var at any
			if rows.Scan(&id, &kind, &title, &amt, &cp, &at) == nil {
				txs = append(txs, map[string]any{
					"id":             id,
					"kind":           kind,
					"title":          title,
					"amount":         amt,
					"counterpart_id": cp,
					"created_at":     at,
				})
			}
		}
	}
	send(w, 200, map[string]any{
		"balance":      balance,
		"points":       points,
		"transactions": txs,
	})
}

func (a *App) sendWalletMoney(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ToUserID       string `json:"to_user_id"`
		Amount         int64  `json:"amount"`
		Note           string `json:"note"`
		ConversationID string `json:"conversation_id"`
	}
	if decode(r, &in) != nil || !auth.ValidUUID(in.ToUserID) || in.Amount <= 0 {
		fail(w, 400, "invalid transfer request")
		return
	}
	uid := claims(r).Subject
	if uid == in.ToUserID {
		fail(w, 400, "cannot send money to self")
		return
	}
	balance, _ := a.ensureWallet(r, uid)
	if balance < in.Amount {
		fail(w, 400, "잔액이 부족합니다")
		return
	}
	a.ensureWallet(r, in.ToUserID)

	var recipientName string
	if err := a.db.QueryRowContext(r.Context(), "SELECT display_name FROM identity.users WHERE id=$1", in.ToUserID).Scan(&recipientName); err != nil {
		fail(w, 404, "recipient not found")
		return
	}
	var senderName string
	_ = a.db.QueryRowContext(r.Context(), "SELECT display_name FROM identity.users WHERE id=$1", uid).Scan(&senderName)

	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		fail(w, 500, "wallet unavailable")
		return
	}
	defer tx.Rollback()

	debit, derr := tx.ExecContext(r.Context(), "UPDATE commerce.wallets SET balance=balance-$2, updated_at=now() WHERE user_id=$1 AND balance>=$2", uid, in.Amount)
	if derr != nil { fail(w, 500, "transfer failed"); return }
	if dra, _ := debit.RowsAffected(); dra != 1 { fail(w, 400, "잔액이 부족합니다"); return }
	_, _ = tx.ExecContext(r.Context(), "UPDATE commerce.wallets SET balance=balance+$2, updated_at=now() WHERE user_id=$1", in.ToUserID, in.Amount)

	var txID string
	_ = tx.QueryRowContext(r.Context(),
		"INSERT INTO commerce.wallet_transactions(user_id,kind,title,amount,counterpart_id) VALUES($1,'out',$2,$3,$4) RETURNING id",
		uid, recipientName+" 송금", in.Amount, in.ToUserID).Scan(&txID)
	_, _ = tx.ExecContext(r.Context(),
		"INSERT INTO commerce.wallet_transactions(user_id,kind,title,amount,counterpart_id) VALUES($1,'in',$2,$3,$4)",
		in.ToUserID, senderName+" 송금 받음", in.Amount, uid)

	if tx.Commit() != nil {
		fail(w, 500, "transfer commit failed")
		return
	}

	// Find or use direct conversation to post LINE Pay transfer bubble
	convID := in.ConversationID
	if !auth.ValidUUID(convID) {
		_ = a.db.QueryRowContext(r.Context(),
			`SELECT c.id FROM chat.conversations c
			 JOIN chat.conversation_members m1 ON m1.conversation_id=c.id AND m1.user_id=$1
			 JOIN chat.conversation_members m2 ON m2.conversation_id=c.id AND m2.user_id=$2
			 WHERE c.kind='direct' LIMIT 1`, uid, in.ToUserID).Scan(&convID)
	}
	var payMsg map[string]any
	if auth.ValidUUID(convID) && a.isMember(r, convID) {
		noteText := strings.TrimSpace(in.Note)
		if noteText == "" {
			noteText = fmt.Sprintf("LINE Pay %d원 송금", in.Amount)
		}
		metaBytes, _ := json.Marshal(map[string]any{
			"amount":         in.Amount,
			"to_user_id":     in.ToUserID,
			"recipient_name": recipientName,
			"transaction_id": txID,
		})
		var seq int64
		var msgID string
		var createdAt any
		if err := a.db.QueryRowContext(r.Context(), "UPDATE chat.conversations SET last_sequence=last_sequence+1, updated_at=now() WHERE id=$1 RETURNING last_sequence", convID).Scan(&seq); err == nil {
			clientID := fmt.Sprintf("pay-%d", time.Now().UnixNano())
			if err := a.db.QueryRowContext(r.Context(),
				`INSERT INTO chat.messages(conversation_id,sender_id,client_id,sequence,kind,body,metadata)
				 VALUES($1,$2,$3,$4,'pay',$5,$6) RETURNING id, created_at`,
				convID, uid, clientID, seq, noteText, string(metaBytes)).Scan(&msgID, &createdAt); err == nil {
				payMsg = map[string]any{
					"id":              msgID,
					"conversation_id": convID,
					"sender_id":       uid,
					"client_id":       clientID,
					"sequence":        seq,
					"kind":            "pay",
					"body":            noteText,
					"metadata":        map[string]any{"amount": in.Amount, "to_user_id": in.ToUserID, "recipient_name": recipientName},
					"created_at":      createdAt,
				}
				evt, _ := json.Marshal(map[string]any{"type": "message.created", "message": payMsg})
				a.hub.Notify(a.conversationMemberIDs(r, convID), evt)
			}
		}
	}

	newBal, newPts := a.ensureWallet(r, uid)
	send(w, 200, map[string]any{
		"balance": newBal,
		"points":  newPts,
		"transaction": map[string]any{
			"id":         txID,
			"kind":       "out",
			"title":      recipientName + " 송금",
			"amount":     in.Amount,
			"created_at": time.Now().UTC().Format(time.RFC3339),
		},
		"message": payMsg,
	})
}

func (a *App) chargeWallet(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("ALLOW_WALLET_TOPUP_SIM") != "true" { fail(w, http.StatusServiceUnavailable, "payments unavailable: verified provider integration required"); return }
	var in struct {
		Amount int64 `json:"amount"`
	}
	if decode(r, &in) != nil || in.Amount <= 0 {
		fail(w, 400, "invalid charge amount")
		return
	}
	uid := claims(r).Subject
	a.ensureWallet(r, uid)
	bonusPoints := in.Amount / 100
	_, e := a.db.ExecContext(r.Context(),
		"UPDATE commerce.wallets SET balance=balance+$2, points=points+$3, updated_at=now() WHERE user_id=$1",
		uid, in.Amount, bonusPoints)
	if e != nil {
		fail(w, 500, "wallet charge failed")
		return
	}
	var txID string
	_ = a.db.QueryRowContext(r.Context(),
		"INSERT INTO commerce.wallet_transactions(user_id,kind,title,amount) VALUES($1,'in','LINE Pay 머니 충전',$2) RETURNING id",
		uid, in.Amount).Scan(&txID)
	bal, pts := a.ensureWallet(r, uid)
	send(w, 200, map[string]any{
		"balance": bal,
		"points":  pts,
		"transaction": map[string]any{
			"id":         txID,
			"kind":       "in",
			"title":      "LINE Pay 머니 충전",
			"amount":     in.Amount,
			"created_at": time.Now().UTC().Format(time.RFC3339),
		},
	})
}

// listNews serves explicitly labelled editorial SAMPLE content (never real
// press), mirroring the edge worker's NEWS_SAMPLE shape.
func (a *App) listNews(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC().Format(time.RFC3339)
	hero := []any{
		map[string]any{"id": "news-hero-01", "title": "LUNO 베타 오픈: 더 가벼운 글로벌 메신저", "press": "LUNO 에디토리얼(샘플)", "category": "공지", "published_at": now, "summary": "LUNO 베타 서비스가 열렸습니다.", "content": "LUNO 베타 서비스가 열렸습니다. 이 기사는 샘플 콘텐츠이며 실제 언론 기사가 아닙니다.", "sample": true},
	}
	popular := []any{
		map[string]any{"id": "news-pop-01", "rank": 1, "title": "안전한 메신저 사용 수칙 5가지", "press": "LUNO 에디토리얼(샘플)", "category": "보안", "published_at": now, "summary": "QR 승인 내역 확인과 기기 관리로 계정을 지키세요.", "content": "QR 승인 내역 확인과 기기 관리로 계정을 지키세요. 이 기사는 샘플 콘텐츠이며 실제 언론 기사가 아닙니다.", "sample": true},
		map[string]any{"id": "news-pop-02", "rank": 2, "title": "그룹 채팅 200% 활용법", "press": "LUNO 에디토리얼(샘플)", "category": "팁", "published_at": now, "summary": "투표·일정·앨범으로 모임을 정리하세요.", "content": "투표·일정·앨범으로 모임을 정리하세요. 이 기사는 샘플 콘텐츠이며 실제 언론 기사가 아닙니다.", "sample": true},
	}
	send(w, 200, map[string]any{"sample": true, "source": "LUNO 에디토리얼 샘플 콘텐츠 (실제 언론 기사가 아닙니다)", "hero": hero, "popular": popular, "fetched_at": now})
}

func (a *App) listStories(w http.ResponseWriter, r *http.Request) {
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT s.id, s.author_id, u.display_name, s.text, s.bg, s.created_at
		 FROM community.stories s JOIN identity.users u ON u.id=s.author_id
		 ORDER BY s.created_at DESC LIMIT 50`)
	out := make([]any, 0)
	if e == nil {
		defer rows.Close()
		for rows.Next() {
			var id, authorID, authorName, text, bg string
			var at any
			if rows.Scan(&id, &authorID, &authorName, &text, &bg, &at) == nil {
				out = append(out, map[string]any{
					"id":          id,
					"author_id":   authorID,
					"author_name": authorName,
					"text":        text,
					"bg":          bg,
					"created_at":  at,
				})
			}
		}
	}
	send(w, 200, map[string]any{"stories": out})
}

func (a *App) createStory(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Text string `json:"text"`
		Bg   string `json:"bg"`
	}
	if decode(r, &in) != nil || len(strings.TrimSpace(in.Text)) == 0 {
		fail(w, 400, "invalid story text")
		return
	}
	if in.Bg == "" {
		in.Bg = "linear-gradient(135deg,#06C755,#00B900)"
	}
	uid := claims(r).Subject
	var id string
	var at any
	e := a.db.QueryRowContext(r.Context(),
		"INSERT INTO community.stories(author_id,text,bg) VALUES($1,$2,$3) RETURNING id, created_at",
		uid, strings.TrimSpace(in.Text), in.Bg).Scan(&id, &at)
	if e != nil {
		fail(w, 500, "story creation failed")
		return
	}
	var authorName string
	_ = a.db.QueryRowContext(r.Context(), "SELECT display_name FROM identity.users WHERE id=$1", uid).Scan(&authorName)
	send(w, 201, map[string]any{
		"id":          id,
		"author_id":   uid,
		"author_name": authorName,
		"text":        strings.TrimSpace(in.Text),
		"bg":          in.Bg,
		"created_at":  at,
	})
}

func (a *App) listVoomPosts(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT p.id, p.author_id, u.display_name, COALESCE(u.handle,''), p.body, p.media_emoji, p.media_bg, p.tags, p.likes, p.shares, p.created_at
		 FROM community.voom_posts p JOIN identity.users u ON u.id=p.author_id
		 ORDER BY p.created_at DESC LIMIT 50`)
	type voomRow struct {
		id, authorID, authorName, handle, body, emoji, bg, tagsRaw string
		likes, shares                                              int
		at                                                         any
	}
	var vRows []voomRow
	if e == nil {
		for rows.Next() {
			var vr voomRow
			if rows.Scan(&vr.id, &vr.authorID, &vr.authorName, &vr.handle, &vr.body, &vr.emoji, &vr.bg, &vr.tagsRaw, &vr.likes, &vr.shares, &vr.at) == nil {
				vRows = append(vRows, vr)
			}
		}
		rows.Close()
	}
	out := make([]any, 0, len(vRows))
	for _, vr := range vRows {
		var tags []string
		_ = json.Unmarshal([]byte(vr.tagsRaw), &tags)
		if tags == nil {
			tags = []string{}
		}
		var liked bool
		_ = a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM community.voom_likes WHERE post_id=$1 AND user_id=$2)", vr.id, uid).Scan(&liked)

		cRows, cErr := a.db.QueryContext(r.Context(),
			`SELECT c.id, c.author_id, u.display_name, c.text, c.created_at
			 FROM community.voom_comments c JOIN identity.users u ON u.id=c.author_id
			 WHERE c.post_id=$1 ORDER BY c.created_at ASC`, vr.id)
		comments := make([]any, 0)
		if cErr == nil {
			for cRows.Next() {
				var cid, cAuthorID, cAuthorName, cText string
				var cAt any
				if cRows.Scan(&cid, &cAuthorID, &cAuthorName, &cText, &cAt) == nil {
					comments = append(comments, map[string]any{
						"id":          cid,
						"author_id":   cAuthorID,
						"author_name": cAuthorName,
						"text":        cText,
						"created_at":  cAt,
					})
				}
			}
			cRows.Close()
		}
		handle := vr.handle
		if handle == "" {
			handle = "@" + strings.ToLower(strings.ReplaceAll(vr.authorName, " ", "_"))
		} else if !strings.HasPrefix(handle, "@") {
			handle = "@" + handle
		}
		out = append(out, map[string]any{
			"id":            vr.id,
			"author_id":     vr.authorID,
			"author_name":   vr.authorName,
			"author_handle": handle,
			"body":          vr.body,
			"media_emoji":   vr.emoji,
			"media_bg":      vr.bg,
			"tags":          tags,
			"likes":         vr.likes,
			"liked":         liked,
			"shares":        vr.shares,
			"comments":      comments,
			"created_at":    vr.at,
		})
	}
	send(w, 200, map[string]any{"posts": out})
}

func (a *App) createVoomPost(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Body       string   `json:"body"`
		MediaEmoji string   `json:"media_emoji"`
		MediaBg    string   `json:"media_bg"`
		Tags       []string `json:"tags"`
	}
	if decode(r, &in) != nil || len(strings.TrimSpace(in.Body)) == 0 {
		fail(w, 400, "invalid voom post")
		return
	}
	if in.MediaEmoji == "" {
		in.MediaEmoji = "🎬"
	}
	if in.MediaBg == "" {
		in.MediaBg = "linear-gradient(135deg,#0f172a,#1e293b)"
	}
	if in.Tags == nil {
		in.Tags = []string{"LINE_VOOM"}
	}
	tagsBytes, _ := json.Marshal(in.Tags)
	uid := claims(r).Subject
	var id string
	var at any
	e := a.db.QueryRowContext(r.Context(),
		`INSERT INTO community.voom_posts(author_id,body,media_emoji,media_bg,tags)
		 VALUES($1,$2,$3,$4,$5) RETURNING id, created_at`,
		uid, strings.TrimSpace(in.Body), in.MediaEmoji, in.MediaBg, string(tagsBytes)).Scan(&id, &at)
	if e != nil {
		fail(w, 500, "voom post creation failed")
		return
	}
	var authorName, handle string
	_ = a.db.QueryRowContext(r.Context(), "SELECT display_name, COALESCE(handle,'') FROM identity.users WHERE id=$1", uid).Scan(&authorName, &handle)
	send(w, 201, map[string]any{
		"id":            id,
		"author_id":     uid,
		"author_name":   authorName,
		"author_handle": "@" + handle,
		"body":          strings.TrimSpace(in.Body),
		"media_emoji":   in.MediaEmoji,
		"media_bg":      in.MediaBg,
		"tags":          in.Tags,
		"likes":         0,
		"liked":         false,
		"shares":        0,
		"comments":      []any{},
		"created_at":    at,
	})
}

func (a *App) likeVoomPost(w http.ResponseWriter, r *http.Request) {
	postID := r.PathValue("id")
	if !auth.ValidUUID(postID) {
		fail(w, 400, "invalid post id")
		return
	}
	uid := claims(r).Subject
	var exists bool
	_ = a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM community.voom_likes WHERE post_id=$1 AND user_id=$2)", postID, uid).Scan(&exists)
	liked := false
	if exists {
		_, _ = a.db.ExecContext(r.Context(), "DELETE FROM community.voom_likes WHERE post_id=$1 AND user_id=$2", postID, uid)
		_, _ = a.db.ExecContext(r.Context(), "UPDATE community.voom_posts SET likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END WHERE id=$1", postID)
	} else {
		_, _ = a.db.ExecContext(r.Context(), "INSERT INTO community.voom_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", postID, uid)
		_, _ = a.db.ExecContext(r.Context(), "UPDATE community.voom_posts SET likes = likes + 1 WHERE id=$1", postID)
		liked = true
	}
	var likes int
	_ = a.db.QueryRowContext(r.Context(), "SELECT likes FROM community.voom_posts WHERE id=$1", postID).Scan(&likes)
	send(w, 200, map[string]any{"id": postID, "likes": likes, "liked": liked})
}

func (a *App) commentVoomPost(w http.ResponseWriter, r *http.Request) {
	postID := r.PathValue("id")
	if !auth.ValidUUID(postID) {
		fail(w, 400, "invalid post id")
		return
	}
	var in struct {
		Text string `json:"text"`
	}
	if decode(r, &in) != nil || len(strings.TrimSpace(in.Text)) == 0 {
		fail(w, 400, "invalid comment")
		return
	}
	uid := claims(r).Subject
	var id string
	var at any
	e := a.db.QueryRowContext(r.Context(),
		"INSERT INTO community.voom_comments(post_id,author_id,text) VALUES($1,$2,$3) RETURNING id, created_at",
		postID, uid, strings.TrimSpace(in.Text)).Scan(&id, &at)
	if e != nil {
		fail(w, 500, "comment failed")
		return
	}
	var authorName string
	_ = a.db.QueryRowContext(r.Context(), "SELECT display_name FROM identity.users WHERE id=$1", uid).Scan(&authorName)
	send(w, 201, map[string]any{
		"id":          id,
		"post_id":     postID,
		"author_id":   uid,
		"author_name": authorName,
		"text":        strings.TrimSpace(in.Text),
		"created_at":  at,
	})
}

func (a *App) listNotes(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !a.isMember(r, convID) {
		fail(w, 403, "conversation forbidden")
		return
	}
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT n.id, n.conversation_id, n.author_id, u.display_name, n.body, n.likes, n.created_at
		 FROM chat.notes n JOIN identity.users u ON u.id=n.author_id
		 WHERE n.conversation_id=$1 ORDER BY n.created_at DESC`, convID)
	out := make([]any, 0)
	if e == nil {
		defer rows.Close()
		for rows.Next() {
			var id, cid, authorID, authorName, body string
			var likes int
			var at any
			if rows.Scan(&id, &cid, &authorID, &authorName, &body, &likes, &at) == nil {
				out = append(out, map[string]any{
					"id":              id,
					"conversation_id": cid,
					"author_id":       authorID,
					"author_name":     authorName,
					"body":            body,
					"likes":           likes,
					"created_at":      at,
				})
			}
		}
	}
	send(w, 200, map[string]any{"notes": out})
}

func (a *App) createNote(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !a.isMember(r, convID) {
		fail(w, 403, "conversation forbidden")
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if decode(r, &in) != nil || len(strings.TrimSpace(in.Body)) == 0 {
		fail(w, 400, "invalid note body")
		return
	}
	uid := claims(r).Subject
	var id string
	var at any
	e := a.db.QueryRowContext(r.Context(),
		"INSERT INTO chat.notes(conversation_id,author_id,body) VALUES($1,$2,$3) RETURNING id, created_at",
		convID, uid, strings.TrimSpace(in.Body)).Scan(&id, &at)
	if e != nil {
		fail(w, 500, "note creation failed")
		return
	}
	var authorName string
	_ = a.db.QueryRowContext(r.Context(), "SELECT display_name FROM identity.users WHERE id=$1", uid).Scan(&authorName)
	send(w, 201, map[string]any{
		"id":              id,
		"conversation_id": convID,
		"author_id":       uid,
		"author_name":     authorName,
		"body":            strings.TrimSpace(in.Body),
		"likes":           0,
		"created_at":      at,
	})
}

func (a *App) deleteNote(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	noteID := r.PathValue("noteId")
	if !a.isMember(r, convID) || !auth.ValidUUID(noteID) {
		fail(w, 403, "forbidden")
		return
	}
	_, _ = a.db.ExecContext(r.Context(), "DELETE FROM chat.notes WHERE id=$1 AND conversation_id=$2", noteID, convID)
	send(w, 200, map[string]string{"status": "deleted"})
}

func (a *App) listEvents(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !a.isMember(r, convID) {
		fail(w, 403, "conversation forbidden")
		return
	}
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT id, conversation_id, title, starts_at, location, created_by, created_at
		 FROM chat.events WHERE conversation_id=$1 ORDER BY created_at DESC`, convID)
	type evRow struct {
		id, cid, title, startsAt, loc, by string
		at                                any
	}
	var eRows []evRow
	if e == nil {
		for rows.Next() {
			var er evRow
			if rows.Scan(&er.id, &er.cid, &er.title, &er.startsAt, &er.loc, &er.by, &er.at) == nil {
				eRows = append(eRows, er)
			}
		}
		rows.Close()
	}
	out := make([]any, 0, len(eRows))
	for _, er := range eRows {
		going := make([]string, 0)
		declined := make([]string, 0)
		rRows, rErr := a.db.QueryContext(r.Context(), "SELECT user_id, status FROM chat.event_rsvps WHERE event_id=$1", er.id)
		if rErr == nil {
			for rRows.Next() {
				var rUID, rSt string
				if rRows.Scan(&rUID, &rSt) == nil {
					switch rSt {
					case "going":
						going = append(going, rUID)
					case "declined":
						declined = append(declined, rUID)
					}
				}
			}
			rRows.Close()
		}
		out = append(out, map[string]any{
			"id":              er.id,
			"conversation_id": er.cid,
			"title":           er.title,
			"starts_at":       er.startsAt,
			"location":        er.loc,
			"created_by":      er.by,
			"going":           going,
			"declined":        declined,
			"created_at":      er.at,
		})
	}
	send(w, 200, map[string]any{"events": out})
}

func (a *App) createEvent(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !a.isMember(r, convID) {
		fail(w, 403, "conversation forbidden")
		return
	}
	var in struct {
		Title    string `json:"title"`
		StartsAt string `json:"starts_at"`
		Location string `json:"location"`
	}
	if decode(r, &in) != nil || len(strings.TrimSpace(in.Title)) == 0 {
		fail(w, 400, "invalid event")
		return
	}
	uid := claims(r).Subject
	var id string
	var at any
	e := a.db.QueryRowContext(r.Context(),
		"INSERT INTO chat.events(conversation_id,title,starts_at,location,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id, created_at",
		convID, strings.TrimSpace(in.Title), in.StartsAt, in.Location, uid).Scan(&id, &at)
	if e != nil {
		fail(w, 500, "event creation failed")
		return
	}
	_, _ = a.db.ExecContext(r.Context(), "INSERT INTO chat.event_rsvps(event_id,user_id,status) VALUES($1,$2,'going') ON CONFLICT DO NOTHING", id, uid)
	send(w, 201, map[string]any{
		"id":              id,
		"conversation_id": convID,
		"title":           strings.TrimSpace(in.Title),
		"starts_at":       in.StartsAt,
		"location":        in.Location,
		"created_by":      uid,
		"going":           []string{uid},
		"declined":        []string{},
		"created_at":      at,
	})
}

func (a *App) rsvpEvent(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	if !auth.ValidUUID(eventID) {
		fail(w, 400, "invalid event id")
		return
	}
	var convID string
	if err := a.db.QueryRowContext(r.Context(), "SELECT conversation_id FROM chat.events WHERE id=$1", eventID).Scan(&convID); err == sql.ErrNoRows {
		fail(w, 404, "event not found")
		return
	} else if err != nil || !a.isMember(r, convID) {
		fail(w, 403, "event forbidden")
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if decode(r, &in) != nil || (in.Status != "going" && in.Status != "maybe" && in.Status != "declined") {
		fail(w, 400, "invalid rsvp status")
		return
	}
	uid := claims(r).Subject
	_, e := a.db.ExecContext(r.Context(),
		`INSERT INTO chat.event_rsvps(event_id,user_id,status,updated_at) VALUES($1,$2,$3,now())
		 ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status, updated_at=now()`,
		eventID, uid, in.Status)
	if e != nil {
		fail(w, 500, "rsvp failed")
		return
	}
	going := make([]string, 0)
	declined := make([]string, 0)
	rRows, rErr := a.db.QueryContext(r.Context(), "SELECT user_id, status FROM chat.event_rsvps WHERE event_id=$1", eventID)
	if rErr == nil {
		for rRows.Next() {
			var rUID, rSt string
			if rRows.Scan(&rUID, &rSt) == nil {
				switch rSt {
				case "going":
					going = append(going, rUID)
				case "declined":
					declined = append(declined, rUID)
				}
			}
		}
		rRows.Close()
	}
	send(w, 200, map[string]any{"id": eventID, "going": going, "declined": declined})
}

func (a *App) unpinMessage(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	msgID := r.PathValue("msgId")
	if !a.isMember(r, convID) || !auth.ValidUUID(msgID) {
		fail(w, 403, "forbidden")
		return
	}
	_, _ = a.db.ExecContext(r.Context(), "DELETE FROM chat.pinned_messages WHERE conversation_id=$1 AND message_id=$2", convID, msgID)
	send(w, 200, map[string]string{"status": "unpinned"})
}

func (a *App) listConversationMedia(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !a.isMember(r, convID) {
		fail(w, 403, "conversation forbidden")
		return
	}
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT id, sender_id, kind, body, metadata, created_at
		 FROM chat.messages
		 WHERE conversation_id=$1 AND deleted_at IS NULL AND kind IN ('image','file','voice')
		 ORDER BY sequence DESC LIMIT 100`, convID)
	out := make([]any, 0)
	if e == nil {
		defer rows.Close()
		for rows.Next() {
			var id, sender, kind, body, metaRaw string
			var at any
			if rows.Scan(&id, &sender, &kind, &body, &metaRaw, &at) == nil {
				var meta map[string]any
				_ = json.Unmarshal([]byte(metaRaw), &meta)
				out = append(out, map[string]any{
					"id":         id,
					"sender_id":  sender,
					"kind":       kind,
					"body":       body,
					"metadata":   meta,
					"created_at": at,
				})
			}
		}
	}
	send(w, 200, map[string]any{"media": out})
}

func (a *App) searchConversationMessages(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !a.isMember(r, convID) {
		fail(w, 403, "conversation forbidden")
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		send(w, 200, map[string]any{"results": []any{}})
		return
	}
	if len(q) > 100 {
		fail(w, 400, "query must be at most 100 bytes")
		return
	}
	rows, e := a.db.QueryContext(r.Context(),
		`SELECT id, sender_id, sequence, kind, body, created_at
		 FROM chat.messages
		 WHERE conversation_id=$1 AND deleted_at IS NULL
		 ORDER BY sequence DESC`, convID)
	if e != nil {
		fail(w, 500, "message search unavailable")
		return
	}
	out := make([]any, 0)
	if e == nil {
		defer rows.Close()
		for rows.Next() {
			var id, sender, kind, body string
			var seq int64
			var at any
			if rows.Scan(&id, &sender, &seq, &kind, &body, &at) == nil {
				body = a.msgCipher.decrypt(body)
				if !strings.Contains(strings.ToLower(body), strings.ToLower(q)) {
					continue
				}
				out = append(out, map[string]any{
					"id":         id,
					"sender_id":  sender,
					"sequence":   seq,
					"kind":       kind,
					"body":       body,
					"created_at": at,
				})
				if len(out) == 50 {
					break
				}
			}
		}
		if rows.Err() != nil {
			fail(w, 500, "message search unavailable")
			return
		}
	}
	send(w, 200, map[string]any{"results": out})
}
