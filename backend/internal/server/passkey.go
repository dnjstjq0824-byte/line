package server

// Passkey (WebAuthn) registration ceremonies.
//
// Verification runs through go-webauthn/webauthn; the RP ID and allowed
// origin derive from the request host so every environment works without
// extra config (tests use http://localhost). Challenges are single-use
// with a 5-minute TTL in identity.passkey_challenges; verified credentials
// persist as JSON in identity.passkey_credentials.

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	webauthnlib "github.com/go-webauthn/webauthn/webauthn"
)

const passkeyChallengeTTL = 5 * time.Minute

type passkeyUser struct {
	id          string
	name        string
	displayName string
	creds       []webauthnlib.Credential
}

func (u *passkeyUser) WebAuthnID() []byte            { return []byte(u.id) }
func (u *passkeyUser) WebAuthnName() string           { return u.name }
func (u *passkeyUser) WebAuthnDisplayName() string    { return u.displayName }
func (u *passkeyUser) WebAuthnCredentials() []webauthnlib.Credential { return u.creds }

func rpIDAndOrigin(r *http.Request) (string, string) {
	host := strings.ToLower(r.Host)
	if i := strings.LastIndex(host, ":"); i >= 0 {
		host = host[:i]
	}
	scheme := "https"
	if r.TLS == nil {
		scheme = "http"
	}
	return host, scheme + "://" + strings.ToLower(r.Host)
}

func (a *App) webAuthnFor(r *http.Request) (*webauthnlib.WebAuthn, error) {
	rpID, origin := rpIDAndOrigin(r)
	return webauthnlib.New(&webauthnlib.Config{
		RPDisplayName:         "LUNO",
		RPID:                  rpID,
		RPOrigins:             []string{origin},
		AttestationPreference: protocol.PreferNoAttestation,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			UserVerification: protocol.VerificationPreferred,
		},
	})
}

func (a *App) loadPasskeyUser(r *http.Request, uid string) (*passkeyUser, error) {
	var email, name string
	if e := a.db.QueryRowContext(r.Context(),
		"SELECT email,display_name FROM identity.users WHERE id=$1", uid).Scan(&email, &name); e != nil {
		return nil, e
	}
	u := &passkeyUser{id: uid, name: email, displayName: name}
	rows, e := a.db.QueryContext(r.Context(),
		"SELECT credential FROM identity.passkey_credentials WHERE user_id=$1", uid)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		var cred webauthnlib.Credential
		if rows.Scan(&raw) == nil && json.Unmarshal([]byte(raw), &cred) == nil {
			u.creds = append(u.creds, cred)
		}
	}
	return u, rows.Err()
}

func (a *App) passkeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	user, e := a.loadPasskeyUser(r, uid)
	if e != nil {
		fail(w, 404, "not found")
		return
	}
	wlib, e := a.webAuthnFor(r)
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	var excl []protocol.CredentialDescriptor
	for _, c := range user.creds {
		excl = append(excl, protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: c.ID,
		})
	}
	creation, session, e := wlib.BeginRegistration(user, webauthnlib.WithExclusions(excl))
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	raw, _ := json.Marshal(session)
	now := time.Now().UTC()
	exp := now.Add(passkeyChallengeTTL).Format(time.RFC3339)
	_, _ = a.db.ExecContext(r.Context(), "DELETE FROM identity.passkey_challenges WHERE expires_at<$1", now.Format(time.RFC3339))
	if _, e = a.db.ExecContext(r.Context(),
		"INSERT INTO identity.passkey_challenges(challenge,user_id,purpose,session,expires_at) VALUES ($1,$2,'registration',$3,$4) ON CONFLICT(challenge) DO UPDATE SET session=$3,expires_at=$4,created_at=now()",
		session.Challenge, uid, string(raw), exp); e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	send(w, 200, creation)
}

func (a *App) passkeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	user, e := a.loadPasskeyUser(r, uid)
	if e != nil {
		fail(w, 404, "not found")
		return
	}
	var raw, exp string
	e = a.db.QueryRowContext(r.Context(),
		"SELECT session,expires_at FROM identity.passkey_challenges WHERE user_id=$1 AND purpose='registration' ORDER BY created_at DESC LIMIT 1",
		uid).Scan(&raw, &exp)
	if e != nil {
		fail(w, 400, "no active registration ceremony")
		return
	}
	var session webauthnlib.SessionData
	if json.Unmarshal([]byte(raw), &session) != nil {
		fail(w, 400, "no active registration ceremony")
		return
	}
	if t, e := time.Parse(time.RFC3339, exp); e != nil || time.Now().UTC().After(t) {
		fail(w, 400, "registration challenge expired")
		return
	}
	// Single-use: consume before verifying so a response can never replay.
	_, _ = a.db.ExecContext(r.Context(), "DELETE FROM identity.passkey_challenges WHERE user_id=$1 AND purpose='registration'", uid)
	wlib, e := a.webAuthnFor(r)
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	cred, e := wlib.FinishRegistration(user, session, r)
	if e != nil {
		fail(w, 400, "passkey verification failed")
		return
	}
	// Worker parity: the edge verifier accepts none + packed(self) only.
	if cred.AttestationFormat != "none" && cred.AttestationFormat != "packed" {
		fail(w, 400, "unsupported attestation format")
		return
	}
	credRaw, _ := json.Marshal(cred)
	credID := base64.RawURLEncoding.EncodeToString(cred.ID)
	if _, e = a.db.ExecContext(r.Context(),
		"INSERT INTO identity.passkey_credentials(id,user_id,credential) VALUES ($1,$2,$3) ON CONFLICT(id) DO NOTHING",
		credID, uid, string(credRaw)); e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	send(w, 200, map[string]any{"verified": true, "credential_id": credID})
}

func (a *App) passkeyLoginBegin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if decode(r, &in) != nil || strings.TrimSpace(in.Email) == "" {
		fail(w, 400, "invalid request")
		return
	}
	var uid string
	if e := a.db.QueryRowContext(r.Context(),
		"SELECT id FROM identity.users WHERE email=$1 AND state='active'",
		strings.ToLower(strings.TrimSpace(in.Email))).Scan(&uid); e != nil {
		fail(w, 401, "invalid credentials")
		return
	}
	user, e := a.loadPasskeyUser(r, uid)
	if e != nil || len(user.creds) == 0 {
		fail(w, 401, "invalid credentials")
		return
	}
	wlib, e := a.webAuthnFor(r)
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	assertion, session, e := wlib.BeginLogin(user)
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	raw, _ := json.Marshal(session)
	now := time.Now().UTC()
	exp := now.Add(passkeyChallengeTTL).Format(time.RFC3339)
	_, _ = a.db.ExecContext(r.Context(), "DELETE FROM identity.passkey_challenges WHERE expires_at<$1", now.Format(time.RFC3339))
	if _, e = a.db.ExecContext(r.Context(),
		"INSERT INTO identity.passkey_challenges(challenge,user_id,purpose,session,expires_at) VALUES ($1,$2,'authentication',$3,$4) ON CONFLICT(challenge) DO UPDATE SET session=$3,expires_at=$4,created_at=now()",
		session.Challenge, uid, string(raw), exp); e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	send(w, 200, assertion)
}

func (a *App) passkeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	rawBody, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if e != nil {
		fail(w, 400, "invalid request")
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(rawBody))
	var probe struct {
		Response struct {
			ClientDataJSON string `json:"clientDataJSON"`
		} `json:"response"`
		DeviceName string `json:"device_name"`
		Platform   string `json:"platform"`
	}
	if json.Unmarshal(rawBody, &probe) != nil || probe.Response.ClientDataJSON == "" {
		fail(w, 400, "invalid request")
		return
	}
	cdBytes, e := base64.RawURLEncoding.DecodeString(probe.Response.ClientDataJSON)
	if e != nil {
		fail(w, 400, "invalid request")
		return
	}
	var cd struct {
		Challenge string `json:"challenge"`
	}
	if json.Unmarshal(cdBytes, &cd) != nil || cd.Challenge == "" {
		fail(w, 400, "invalid request")
		return
	}
	var uid, sessionRaw, exp string
	if e = a.db.QueryRowContext(r.Context(),
		"SELECT user_id,session,expires_at FROM identity.passkey_challenges WHERE challenge=$1 AND purpose='authentication'",
		cd.Challenge).Scan(&uid, &sessionRaw, &exp); e != nil {
		fail(w, 400, "no active login ceremony")
		return
	}
	var session webauthnlib.SessionData
	if json.Unmarshal([]byte(sessionRaw), &session) != nil {
		fail(w, 400, "no active login ceremony")
		return
	}
	if t, e := time.Parse(time.RFC3339, exp); e != nil || time.Now().UTC().After(t) {
		fail(w, 400, "login challenge expired")
		return
	}
	// Single-use: consume before verifying.
	_, _ = a.db.ExecContext(r.Context(), "DELETE FROM identity.passkey_challenges WHERE challenge=$1", cd.Challenge)
	user, e := a.loadPasskeyUser(r, uid)
	if e != nil {
		fail(w, 401, "account unavailable")
		return
	}
	wlib, e := a.webAuthnFor(r)
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	cred, e := wlib.FinishLogin(user, session, r)
	if e != nil {
		fail(w, 401, "passkey verification failed")
		return
	}
	// Fail closed on a cloned-authenticator signal (worker parity).
	if cred.Authenticator.CloneWarning {
		fail(w, 401, "passkey verification failed")
		return
	}
	// Persist the updated signature counter.
	credRaw, _ := json.Marshal(cred)
	credID := base64.RawURLEncoding.EncodeToString(cred.ID)
	_, _ = a.db.ExecContext(r.Context(),
		"UPDATE identity.passkey_credentials SET credential=$2,last_used_at=now() WHERE id=$1 AND user_id=$3",
		credID, string(credRaw), uid)
	var role, state string
	if e := a.db.QueryRowContext(r.Context(), "SELECT role,state FROM identity.users WHERE id=$1", uid).Scan(&role, &state); e != nil || state != "active" {
		fail(w, 401, "account unavailable")
		return
	}
	device := probe.DeviceName
	if device == "" {
		device = "Passkey"
	}
	platform := probe.Platform
	if platform == "" {
		platform = "web"
	}
	resp, e := a.issueSessionTokens(r, uid, role, device, platform, true)
	if e != nil {
		fail(w, 500, "token signing unavailable")
		return
	}
	send(w, 200, resp)
}

func (a *App) passkeyList(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	rows, e := a.db.QueryContext(r.Context(),
		"SELECT id,name,created_at,COALESCE(last_used_at,'') FROM identity.passkey_credentials WHERE user_id=$1 ORDER BY created_at",
		uid)
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	defer rows.Close()
	result := make([]any, 0)
	for rows.Next() {
		var id, name, created, used string
		if rows.Scan(&id, &name, &created, &used) == nil {
			result = append(result, map[string]any{"id": id, "name": name, "created_at": created, "last_used_at": used})
		}
	}
	send(w, 200, map[string]any{"passkeys": result})
}

func (a *App) passkeyDelete(w http.ResponseWriter, r *http.Request) {
	uid := claims(r).Subject
	id := r.PathValue("id")
	if id == "" {
		fail(w, 400, "invalid request")
		return
	}
	res, e := a.db.ExecContext(r.Context(),
		"DELETE FROM identity.passkey_credentials WHERE id=$1 AND user_id=$2", id, uid)
	if e != nil {
		fail(w, 500, "passkey unavailable")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		fail(w, 404, "not found")
		return
	}
	send(w, 200, map[string]any{"deleted": true})
}
