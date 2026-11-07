package server

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestNewsSampleFeed(t *testing.T) {
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "news.db")),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()
	c := &apiClient{t: t, srv: srv}
	if st, _ := c.req("GET", "/api/v1/news", nil); st != 401 {
		t.Fatalf("news without token must be 401, got %d", st)
	}
	if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
		"email": "news@example.test", "password": "NewsReaderPass#2026!", "display_name": "News Reader",
	}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
		"email": "news@example.test", "password": "NewsReaderPass#2026!",
	})
	if status != 200 {
		t.Fatalf("login: %d %v", status, result)
	}
	c.token = result["access_token"].(string)
	st, body := c.req("GET", "/api/v1/news", nil)
	if st != 200 {
		t.Fatalf("news status: %d %v", st, body)
	}
	if body["sample"] != true || len(body["hero"].([]any)) != 1 || len(body["popular"].([]any)) != 2 {
		t.Fatalf("news body: %v", body)
	}
}

func TestWalletChargeFailClosedWithoutSimulatorFlag(t *testing.T) {
	t.Setenv("ALLOW_WALLET_TOPUP_SIM", "")
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "wallet_failclosed.db")),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()
	c := &apiClient{t: t, srv: srv}
	if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
		"email": "failclosed@example.test", "password": "FailClosedPass#2026!", "display_name": "Fail Closed",
	}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
		"email": "failclosed@example.test", "password": "FailClosedPass#2026!",
	})
	if status != 200 {
		t.Fatalf("login: %d %v", status, result)
	}
	c.token = result["access_token"].(string)
	if st, out := c.req("POST", "/api/v1/wallet/charge", map[string]any{"amount": 10000}); st != 503 {
		t.Fatalf("charge without simulator flag must fail closed: %d %v", st, out)
	}
}

func TestLineFeaturesParity(t *testing.T) {
	t.Setenv("ALLOW_WALLET_TOPUP_SIM", "true")
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), "line_features.db")),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	defer func() { srv.Close(); app.Close() }()

	login := func(email, password, name, handle string) *apiClient {
		c := &apiClient{t: t, srv: srv}
		if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
			"email":        email,
			"password":     password,
			"display_name": name,
			"handle":       handle,
		}); st != 201 {
			t.Fatalf("register: %d %v", st, out)
		}
		status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
			"email":       email,
			"password":    password,
			"platform":    "web",
			"device_name": "test",
		})
		if status != 200 {
			t.Fatalf("login: %d %v", status, result)
		}
		c.token = result["access_token"].(string)
		c.userID = result["user_id"].(string)
		return c
	}

	alice := login("alice-line@example.test", "AliceStrongPass#2026!", "Alice Kim", "alice_kim")
	bob := login("bob-line@example.test", "BobStrongPass#2026!", "Bob Lee", "bob_lee")

	// 1. Add friend by handle (@bob_lee)
	if st, out := alice.req("POST", "/api/v1/friends", map[string]any{"handle": "@bob_lee"}); st != 201 {
		t.Fatalf("add friend by handle: %d %v", st, out)
	}

	// 2. Create direct conversation & verify auto-resolved partner title and member_count
	st, conv := alice.req("POST", "/api/v1/conversations", map[string]any{
		"kind":       "direct",
		"member_ids": []string{bob.userID},
	})
	if st != 201 {
		t.Fatalf("create direct conv: %d %v", st, conv)
	}
	cid := conv["id"].(string)

	// 3. Send message and reply message, verify reply_preview & read_count
	st, m1Out := alice.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{
		"client_id": "msg-client-0001",
		"kind":      "text",
		"body":      "안녕하세요 밥!",
	})
	if st != 201 {
		t.Fatalf("send m1: %d %v", st, m1Out)
	}
	m1 := m1Out["message"].(map[string]any)
	m1ID := m1["id"].(string)

	st, m2Out := bob.req("POST", "/api/v1/conversations/"+cid+"/messages", map[string]any{
		"client_id": "msg-client-0002",
		"kind":      "text",
		"body":      "반가워요 앨리스!",
		"reply_to":  m1ID,
	})
	if st != 201 {
		t.Fatalf("send m2 reply: %d %v", st, m2Out)
	}

	// Mark read by Bob -> Alice's m1 should have read_count = 1
	if st, out := bob.req("POST", "/api/v1/conversations/"+cid+"/read", map[string]any{"sequence": 2}); st != 200 {
		t.Fatalf("mark read: %d %v", st, out)
	}

	st, listMsgs := alice.req("GET", "/api/v1/conversations/"+cid+"/messages", nil)
	if st != 200 {
		t.Fatalf("list messages: %d %v", st, listMsgs)
	}
	msgs := listMsgs["messages"].([]any)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	firstMsg := msgs[0].(map[string]any)
	secondMsg := msgs[1].(map[string]any)
	if int(firstMsg["read_count"].(float64)) != 1 {
		t.Fatalf("expected read_count=1 on m1, got %v", firstMsg["read_count"])
	}
	rp, ok := secondMsg["reply_preview"].(map[string]any)
	if !ok || rp["body"] != "안녕하세요 밥!" {
		t.Fatalf("expected reply_preview on m2, got %v", secondMsg["reply_preview"])
	}

	// Verify conversation list includes partner display_name ("Bob Lee"), member_count=2, and last_message
	st, convList := alice.req("GET", "/api/v1/conversations", nil)
	if st != 200 {
		t.Fatalf("list convs: %d %v", st, convList)
	}
	convs := convList["conversations"].([]any)
	c0 := convs[0].(map[string]any)
	if c0["title"] != "Bob Lee" {
		t.Fatalf("expected direct chat title 'Bob Lee', got %v", c0["title"])
	}
	if int(c0["member_count"].(float64)) != 2 {
		t.Fatalf("expected member_count=2, got %v", c0["member_count"])
	}
	if c0["last_message"] == nil {
		t.Fatalf("expected last_message on conversation")
	}

	// 4. Pin and Unpin message
	if st, out := alice.req("POST", "/api/v1/conversations/"+cid+"/pins", map[string]any{"message_id": m1ID}); st != 201 {
		t.Fatalf("pin: %d %v", st, out)
	}
	st, pinsOut := alice.req("GET", "/api/v1/conversations/"+cid+"/pins", nil)
	if st != 200 || len(pinsOut["pins"].([]any)) != 1 {
		t.Fatalf("list pins: %d %v", st, pinsOut)
	}
	pin0 := pinsOut["pins"].([]any)[0].(map[string]any)
	if pin0["body"] != "안녕하세요 밥!" {
		t.Fatalf("expected decrypted body on pin, got %v", pin0["body"])
	}
	if st, out := alice.req("DELETE", "/api/v1/conversations/"+cid+"/pins/"+m1ID, nil); st != 200 {
		t.Fatalf("unpin: %d %v", st, out)
	}

	// 5. Notes CRUD
	st, noteOut := alice.req("POST", "/api/v1/conversations/"+cid+"/notes", map[string]any{"body": "팀 회의록 정리 노트"})
	if st != 201 {
		t.Fatalf("create note: %d %v", st, noteOut)
	}
	noteID := noteOut["id"].(string)
	st, notesList := bob.req("GET", "/api/v1/conversations/"+cid+"/notes", nil)
	if st != 200 || len(notesList["notes"].([]any)) != 1 {
		t.Fatalf("list notes: %d %v", st, notesList)
	}
	if st, out := alice.req("DELETE", "/api/v1/conversations/"+cid+"/notes/"+noteID, nil); st != 200 {
		t.Fatalf("delete note: %d %v", st, out)
	}

	// 6. Events & RSVP
	st, evOut := alice.req("POST", "/api/v1/conversations/"+cid+"/events", map[string]any{
		"title":     "정기 릴리즈 미팅",
		"starts_at": "2026-11-01 14:00",
		"location":  "판교 오피스",
	})
	if st != 201 {
		t.Fatalf("create event: %d %v", st, evOut)
	}
	evID := evOut["id"].(string)
	if st, out := bob.req("POST", "/api/v1/events/"+evID+"/rsvp", map[string]any{"status": "going"}); st != 200 {
		t.Fatalf("rsvp event: %d %v", st, out)
	}
	st, evList := alice.req("GET", "/api/v1/conversations/"+cid+"/events", nil)
	if st != 200 || len(evList["events"].([]any)) != 1 {
		t.Fatalf("list events: %d %v", st, evList)
	}

	// 7. LINE Pay Wallet (get, charge, send money -> creates 'pay' message in direct chat)
	st, wOut := alice.req("GET", "/api/v1/wallet", nil)
	if st != 200 || int64(wOut["balance"].(float64)) != 125000 {
		t.Fatalf("get wallet: %d %v", st, wOut)
	}
	st, cOut := alice.req("POST", "/api/v1/wallet/charge", map[string]any{"amount": 50000})
	if st != 200 || int64(cOut["balance"].(float64)) != 175000 {
		t.Fatalf("charge wallet: %d %v", st, cOut)
	}
	st, sOut := alice.req("POST", "/api/v1/wallet/send", map[string]any{
		"to_user_id":      bob.userID,
		"amount":          25000,
		"note":            "점심값 더치페이",
		"conversation_id": cid,
	})
	if st != 200 || int64(sOut["balance"].(float64)) != 150000 {
		t.Fatalf("send money: %d %v", st, sOut)
	}
	st, bobW := bob.req("GET", "/api/v1/wallet", nil)
	if st != 200 || int64(bobW["balance"].(float64)) != 150000 {
		t.Fatalf("bob wallet balance: %d %v", st, bobW)
	}

	// 7b. Overdraft is rejected atomically and the balance is unchanged.
	if st, out := alice.req("POST", "/api/v1/wallet/send", map[string]any{
		"to_user_id": bob.userID,
		"amount":     999999999,
	}); st != 400 {
		t.Fatalf("overdraft must be rejected: %d %v", st, out)
	}
	st, wOut = alice.req("GET", "/api/v1/wallet", nil)
	if st != 200 || int64(wOut["balance"].(float64)) != 150000 {
		t.Fatalf("balance changed after rejected overdraft: %d %v", st, wOut)
	}

	// 8. Stories & VOOM
	if st, out := alice.req("POST", "/api/v1/stories", map[string]any{"text": "오늘의 라인 스토리!"}); st != 201 {
		t.Fatalf("create story: %d %v", st, out)
	}
	if st, out := bob.req("GET", "/api/v1/stories", nil); st != 200 || len(out["stories"].([]any)) != 1 {
		t.Fatalf("list stories: %d %v", st, out)
	}
	st, vOut := alice.req("POST", "/api/v1/voom", map[string]any{"body": "LINE VOOM 첫 게시물", "tags": []string{"LINE", "VOOM"}})
	if st != 201 {
		t.Fatalf("create voom: %d %v", st, vOut)
	}
	vID := vOut["id"].(string)
	if st, out := bob.req("POST", "/api/v1/voom/"+vID+"/like", map[string]any{}); st != 200 || int(out["likes"].(float64)) != 1 {
		t.Fatalf("like voom: %d %v", st, out)
	}
	if st, out := bob.req("POST", "/api/v1/voom/"+vID+"/comments", map[string]any{"text": "멋져요!"}); st != 201 {
		t.Fatalf("comment voom: %d %v", st, out)
	}
	if st, out := alice.req("GET", "/api/v1/voom", nil); st != 200 || len(out["posts"].([]any)) != 1 {
		t.Fatalf("list voom: %d %v", st, out)
	}

	// 9. In-conversation search & Official Accounts
	st, sRes := alice.req("GET", "/api/v1/conversations/"+cid+"/search?q=점심값", nil)
	if st != 200 || len(sRes["results"].([]any)) != 1 {
		t.Fatalf("search conversation: %d %v", st, sRes)
	}
	if st, out := alice.req("GET", "/api/v1/official-accounts", nil); st != 200 {
		t.Fatalf("official accounts: %d %v", st, out)
	}
}
