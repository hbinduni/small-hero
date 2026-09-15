package api

import (
	"net/http/httptest"
	"strings"
	"testing"

	"smallhero/server/game"
)

func TestStrictJSON(t *testing.T) {
	for _, body := range []string{`null`, `[]`, `{} {}`, `{"id":"x","id":"y"}`, `{"version":null}`, `{"Version":0,"id":"x","type":"rest"}`, `{"id":"x","type":"rest"}`, `{"id":"x","version":0,"type":"rest","gold":999}`} {
		var c game.Command
		if decodeCommand([]byte(body), &c) == nil {
			t.Fatalf("accepted %s", body)
		}
	}
	var c game.Command
	if err := decodeCommand([]byte(`{"id":"11111111-1111-4111-8111-111111111111","version":0,"type":"rest"}`), &c); err != nil {
		t.Fatal(err)
	}
}
func TestOriginAndAuthentication(t *testing.T) {
	app := New(nil, "http://localhost:5173")
	for _, tc := range []struct {
		method, path, origin, content, body string
		code                                int
	}{{"POST", "/api/commands", "http://evil.test", "application/json", "{}", 403}, {"POST", "/api/commands", "http://localhost:5173", "text/plain", "{}", 415}, {"POST", "/api/commands", "http://localhost:5173", "application/json", `{"id":"11111111-1111-4111-8111-111111111111","version":0,"type":"rest"}`, 401}, {"GET", "/api/game", "", "", "", 401}, {"POST", "/api/session", "http://localhost:5173", "application/json", "null", 400}} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Origin", tc.origin)
		req.Header.Set("Content-Type", tc.content)
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != tc.code {
			t.Fatalf("%s %s: %d want %d", tc.method, tc.path, res.StatusCode, tc.code)
		}
	}
}
func TestOriginConfig(t *testing.T) {
	for _, origin := range []string{"", "http://example.com", "https://user@example.com", "https://example.com/path", "https://example.com?x=1"} {
		if ValidOrigin(origin) {
			t.Fatalf("accepted %s", origin)
		}
	}
	for _, origin := range []string{"https://example.com", "http://localhost:5173", "http://127.0.0.1:5173"} {
		if !ValidOrigin(origin) {
			t.Fatalf("rejected %s", origin)
		}
	}
}

func TestTickRejectsClientCombatFields(t *testing.T) {
	app := New(nil, "http://localhost:5173")
	for _, extra := range []string{`,"target":"cinderwing"`, `,"x":1355,"y":300`, `,"hp":100`, `,"damage":28`, `,"gold":100`, `,"serverTime":1`, `,"breath":{"hit":true}`} {
		body := `{"id":"77777777-7777-4777-8777-777777777777","version":0,"type":"tick"` + extra + `}`
		req := httptest.NewRequest("POST", "/api/commands", strings.NewReader(body))
		req.Header.Set("Origin", "http://localhost:5173")
		req.Header.Set("Content-Type", "application/json")
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 400 {
			t.Fatalf("client combat field accepted: %s: %d", extra, res.StatusCode)
		}
	}
}
