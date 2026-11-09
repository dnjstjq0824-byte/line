package server

import (
	"net/http"
	"time"
)

// Smart-channel slot: the single notice card at the top of the talk list
// (LINE parity). Content is curated LUNO announcements only — no ad network,
// no fake promotions. First active window wins; null when nothing is active.
type channelNotice struct {
	ID       string
	Title    string
	Body     string
	StartsAt string
	EndsAt   string
}

var channelNotices = []channelNotice{
	{ID: "luno-voice-launch", Title: "음성 메시지 출시", Body: "대화방 마이크 버튼으로 최대 2분까지 녹음해 보세요.", StartsAt: "2026-11-09T00:00:00Z", EndsAt: "2027-02-09T00:00:00Z"},
	{ID: "luno-passkey-login", Title: "패스키 로그인 지원", Body: "비밀번호 없이 지문·얼굴로 로그인할 수 있습니다.", StartsAt: "2026-11-09T00:00:00Z", EndsAt: "2027-02-09T00:00:00Z"},
}

func (a *App) channelSlot(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC().Format(time.RFC3339)
	for _, n := range channelNotices {
		if n.StartsAt <= now && now < n.EndsAt {
			send(w, 200, map[string]any{"slot": map[string]any{"id": n.ID, "title": n.Title, "body": n.Body}})
			return
		}
	}
	send(w, 200, map[string]any{"slot": nil})
}
