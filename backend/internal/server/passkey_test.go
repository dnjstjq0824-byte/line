package server

// Passkey registration tests with a hand-built virtual authenticator:
// real P-256 keys, well-formed authData/COSE/CBOR, none + packed(self)
// attestation. The RP ID is always "localhost" (the library rejects IPs).

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/asn1"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func pkHead(major byte, n uint64) []byte {
	switch {
	case n < 24:
		return []byte{major<<5 | byte(n)}
	case n < 256:
		return []byte{major<<5 | 24, byte(n)}
	case n < 65536:
		return []byte{major<<5 | 25, byte(n >> 8), byte(n)}
	default:
		return []byte{major<<5 | 26, byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)}
	}
}

func pkInt(n int64) []byte {
	if n >= 0 {
		return pkHead(0, uint64(n))
	}
	return pkHead(1, uint64(-1-n))
}

func pkBytes(b []byte) []byte { return append(pkHead(2, uint64(len(b))), b...) }
func pkText(s string) []byte  { return append(pkHead(3, uint64(len(s))), s...) }

func pkCoseKey(x, y []byte) []byte {
	var b []byte
	b = append(b, pkHead(5, 5)...)
	b = append(b, pkInt(1)...)
	b = append(b, pkInt(2)...)
	b = append(b, pkInt(3)...)
	b = append(b, pkInt(-7)...)
	b = append(b, pkInt(-1)...)
	b = append(b, pkInt(1)...)
	b = append(b, pkInt(-2)...)
	b = append(b, pkBytes(x)...)
	b = append(b, pkInt(-3)...)
	b = append(b, pkBytes(y)...)
	return b
}

type pkFixture struct {
	credID   []byte
	priv     *ecdsa.PrivateKey
	authData []byte
}

func newPKFixture(t *testing.T, rpID string) *pkFixture {
	t.Helper()
	priv, e := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	credID := make([]byte, 32)
	if _, e := rand.Read(credID); e != nil {
		t.Fatal(e)
	}
	x := priv.X.FillBytes(make([]byte, 32))
	y := priv.Y.FillBytes(make([]byte, 32))
	rpHash := sha256.Sum256([]byte(rpID))
	var authData []byte
	authData = append(authData, rpHash[:]...)
	authData = append(authData, 0x41, 0, 0, 0, 0)
	authData = append(authData, make([]byte, 16)...)
	authData = append(authData, byte(len(credID)>>8), byte(len(credID)))
	authData = append(authData, credID...)
	authData = append(authData, pkCoseKey(x, y)...)
	return &pkFixture{credID: credID, priv: priv, authData: authData}
}

func (f *pkFixture) clientData(challenge, origin string) []byte {
	raw, _ := json.Marshal(map[string]string{
		"type":      "webauthn.create",
		"challenge": challenge,
		"origin":    origin,
	})
	return raw
}

func (f *pkFixture) attestationNone() []byte {
	var b []byte
	b = append(b, pkHead(5, 3)...)
	b = append(b, pkText("fmt")...)
	b = append(b, pkText("none")...)
	b = append(b, pkText("authData")...)
	b = append(b, pkBytes(f.authData)...)
	b = append(b, pkText("attStmt")...)
	b = append(b, pkHead(5, 0)...)
	return b
}

func (f *pkFixture) attestationPacked(t *testing.T, clientData []byte) []byte {
	t.Helper()
	cdHash := sha256.Sum256(clientData)
	h := sha256.Sum256(append(append([]byte{}, f.authData...), cdHash[:]...))
	r, s, e := ecdsa.Sign(rand.Reader, f.priv, h[:])
	if e != nil {
		t.Fatal(e)
	}
	// WebAuthn ECDSA signatures are ASN.1 DER encoded.
	sig, e := asn1.Marshal(struct {
		R, S *big.Int
	}{r, s})
	if e != nil {
		t.Fatal(e)
	}
	var b []byte
	b = append(b, pkHead(5, 3)...)
	b = append(b, pkText("fmt")...)
	b = append(b, pkText("packed")...)
	b = append(b, pkText("authData")...)
	b = append(b, pkBytes(f.authData)...)
	b = append(b, pkText("attStmt")...)
	b = append(b, pkHead(5, 2)...)
	b = append(b, pkText("alg")...)
	b = append(b, pkInt(-7)...)
	b = append(b, pkText("sig")...)
	b = append(b, pkBytes(sig)...)
	return b
}

func (f *pkFixture) finishBody(clientData, attObj []byte) map[string]any {
	b64 := base64.RawURLEncoding.EncodeToString
	return map[string]any{
		"id":    b64(f.credID),
		"rawId": b64(f.credID),
		"type":  "public-key",
		"response": map[string]any{
			"clientDataJSON":    b64(clientData),
			"attestationObject": b64(attObj),
		},
	}
}

func pkTestApp(t *testing.T, name string) (*App, *httptest.Server) {
	t.Helper()
	cfg := Config{
		DSN:     "sqlite://" + filepath.ToSlash(filepath.Join(t.TempDir(), name)),
		Secret:  "0123456789abcdef0123456789abcdef",
		Service: "gateway",
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(app.Handler())
	srv.URL = strings.Replace(srv.URL, "127.0.0.1", "localhost", 1)
	t.Cleanup(func() { srv.Close(); app.Close() })
	return app, srv
}

func pkLogin(t *testing.T, srv *httptest.Server, email, password, name string) *apiClient {
	t.Helper()
	c := &apiClient{t: t, srv: srv}
	if st, out := c.req("POST", "/api/v1/auth/register", map[string]any{
		"email": email, "password": password, "display_name": name,
	}); st != 201 {
		t.Fatalf("register: %d %v", st, out)
	}
	status, result := c.req("POST", "/api/v1/auth/login", map[string]any{
		"email": email, "password": password,
	})
	if status != 200 {
		t.Fatalf("login: %d %v", status, result)
	}
	c.token = result["access_token"].(string)
	c.userID = result["user_id"].(string)
	return c
}

func TestPasskeyRegistrationNone(t *testing.T) {
	_, srv := pkTestApp(t, "passkey_none.db")
	alice := pkLogin(t, srv, "alice-pk@example.test", "AlicePkPass#2026!", "Alice PK")
	origin := srv.URL

	st, begun := alice.req("POST", "/api/v1/passkeys/register/begin", nil)
	if st != 200 {
		t.Fatalf("begin: %d %v", st, begun)
	}
	pk := begun["publicKey"].(map[string]any)
	ch, _ := pk["challenge"].(string)
	if ch == "" {
		t.Fatalf("begin must issue a challenge: %v", begun)
	}
	if pk["rp"].(map[string]any)["id"] != "localhost" {
		t.Fatalf("rp.id must be localhost: %v", pk["rp"])
	}
	if pk["attestation"] != "none" {
		t.Fatalf("attestation preference must be none: %v", begun)
	}
	es256 := false
	for _, p := range pk["pubKeyCredParams"].([]any) {
		if int(p.(map[string]any)["alg"].(float64)) == -7 {
			es256 = true
		}
	}
	if !es256 {
		t.Fatalf("pubKeyCredParams must offer ES256: %v", begun)
	}

	f := newPKFixture(t, "localhost")
	cd := f.clientData(ch, origin)
	st, done := alice.req("POST", "/api/v1/passkeys/register/finish", f.finishBody(cd, f.attestationNone()))
	if st != 200 {
		t.Fatalf("finish: %d %v", st, done)
	}
	credID := base64.RawURLEncoding.EncodeToString(f.credID)
	if done["verified"] != true || done["credential_id"] != credID {
		t.Fatalf("finish must verify: %v", done)
	}

	// Second ceremony excludes the registered credential.
	st, begun2 := alice.req("POST", "/api/v1/passkeys/register/begin", nil)
	if st != 200 {
		t.Fatalf("begin2: %d %v", st, begun2)
	}
	excluded := false
	for _, e := range begun2["publicKey"].(map[string]any)["excludeCredentials"].([]any) {
		if e.(map[string]any)["id"] == credID {
			excluded = true
		}
	}
	if !excluded {
		t.Fatalf("excludeCredentials must list the first credential: %v", begun2)
	}

	// Replaying the consumed finish fails.
	if st, _ := alice.req("POST", "/api/v1/passkeys/register/finish", f.finishBody(cd, f.attestationNone())); st != 400 {
		t.Fatalf("replayed finish must be 400, got %d", st)
	}

	// Tampered origin fails.
	st, begun3 := alice.req("POST", "/api/v1/passkeys/register/begin", nil)
	if st != 200 {
		t.Fatalf("begin3: %d %v", st, begun3)
	}
	f2 := newPKFixture(t, "localhost")
	cdEvil := f2.clientData(begun3["publicKey"].(map[string]any)["challenge"].(string), "https://evil.test")
	if st, _ := alice.req("POST", "/api/v1/passkeys/register/finish", f2.finishBody(cdEvil, f2.attestationNone())); st != 400 {
		t.Fatalf("tampered origin must be 400, got %d", st)
	}

	// Finishing with no ceremony fails.
	bob := pkLogin(t, srv, "bob-pk@example.test", "BobPkPass#2026!", "Bob PK")
	if st, _ := bob.req("POST", "/api/v1/passkeys/register/finish", f.finishBody(cd, f.attestationNone())); st != 400 {
		t.Fatalf("finish without ceremony must be 400, got %d", st)
	}
}

func TestPasskeyRegistrationPacked(t *testing.T) {
	_, srv := pkTestApp(t, "passkey_packed.db")
	alice := pkLogin(t, srv, "alice-packed@example.test", "AlicePkPass#2026!", "Alice Packed")
	origin := srv.URL

	st, begun := alice.req("POST", "/api/v1/passkeys/register/begin", nil)
	if st != 200 {
		t.Fatalf("begin: %d %v", st, begun)
	}
	f := newPKFixture(t, "localhost")
	cd := f.clientData(begun["publicKey"].(map[string]any)["challenge"].(string), origin)
	st, done := alice.req("POST", "/api/v1/passkeys/register/finish", f.finishBody(cd, f.attestationPacked(t, cd)))
	if st != 200 {
		t.Fatalf("packed finish: %d %v", st, done)
	}
	if done["verified"] != true {
		t.Fatalf("packed finish must verify: %v", done)
	}
}
