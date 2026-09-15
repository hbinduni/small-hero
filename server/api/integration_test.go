package api

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"

	"smallhero/server/game"
	"smallhero/server/store"
)

func TestPersistentHTTPSession(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL required for real PostgreSQL test")
	}
	ctx := context.Background()
	s, err := store.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer s.DB.Close()
	app := New(s, "http://localhost:5173")
	request := func(method, path, body string, cookie *http.Cookie) *http.Response {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Origin", "http://localhost:5173")
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		response, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		return response
	}
	created := request("POST", "/api/session", "{}", nil)
	if created.StatusCode != 200 {
		t.Fatalf("create: %d", created.StatusCode)
	}
	cookies := created.Cookies()
	if len(cookies) != 1 {
		t.Fatal("missing session")
	}
	cookie := cookies[0]
	defer created.Body.Close()
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/api" || !validToken(cookie.Value) {
		t.Fatalf("cookie flags: %+v", cookie)
	}
	hash := sha256.Sum256([]byte(cookie.Value))
	defer func() { _, _ = s.DB.Exec(ctx, `DELETE FROM heroes WHERE token_hash=$1`, hash[:]) }()
	var initial game.Response
	if err = json.NewDecoder(created.Body).Decode(&initial); err != nil {
		t.Fatal(err)
	}
	if initial.ServerTime <= 0 || len(initial.State.Enemies) != 4 || initial.State.Enemies[3].Kind != "dragon" {
		t.Fatal("new HTTP session missing dragon or server clock")
	}
	saved := request("POST", "/api/commands", `{"id":"55555555-5555-4555-8555-555555555555","version":0,"type":"rest"}`, cookie)
	defer saved.Body.Close()
	if saved.StatusCode != 200 {
		t.Fatalf("save: %d", saved.StatusCode)
	}
	var savedResponse game.Response
	if err = json.NewDecoder(saved.Body).Decode(&savedResponse); err != nil {
		t.Fatal(err)
	}
	loaded := request("GET", "/api/game", "", cookie)
	defer loaded.Body.Close()
	var restored game.Response
	if err = json.NewDecoder(loaded.Body).Decode(&restored); err != nil {
		t.Fatal(err)
	}
	if loaded.StatusCode != 200 || restored.State.Version != 1 || restored.State.LastActionAt != savedResponse.State.LastActionAt {
		t.Fatal("reload did not preserve save")
	}
	resumed := request("POST", "/api/session", "{}", cookie)
	defer resumed.Body.Close()
	if resumed.StatusCode != 200 || len(resumed.Cookies()) != 0 {
		t.Fatal("existing session replaced")
	}
	encounter := savedResponse.State
	encounter.Position = game.Point{X: 1355, Y: 300}
	fixture, err := json.Marshal(encounter)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.Exec(ctx, `UPDATE heroes SET state=$1 WHERE token_hash=$2`, fixture, hash[:]); err != nil {
		t.Fatal(err)
	}
	const tick = `{"id":"66666666-6666-4666-8666-666666666666","version":1,"type":"tick"}`
	ticked := request("POST", "/api/commands", tick, cookie)
	defer ticked.Body.Close()
	var warning game.Response
	if ticked.StatusCode != 200 || json.NewDecoder(ticked.Body).Decode(&warning) != nil {
		t.Fatalf("HTTP encounter tick failed: %d", ticked.StatusCode)
	}
	breath := warning.State.Enemies[3].Breath
	if warning.State.Version != 2 || warning.State.HP != 100 || breath == nil || breath.StartsAt != warning.ServerTime+1400 || breath.EndsAt != warning.ServerTime+2100 || breath.Aim != encounter.Position {
		t.Fatalf("HTTP warning timing or aim differs from authoritative state: %+v", warning)
	}
	replayed := request("POST", "/api/commands", tick, cookie)
	defer replayed.Body.Close()
	var replay game.Response
	if replayed.StatusCode != 200 || json.NewDecoder(replayed.Body).Decode(&replay) != nil || !reflect.DeepEqual(replay, warning) {
		t.Fatal("HTTP tick replay changed warning, clock, or state")
	}
	reloaded := request("GET", "/api/game", "", cookie)
	defer reloaded.Body.Close()
	var persisted game.Response
	if reloaded.StatusCode != 200 || json.NewDecoder(reloaded.Body).Decode(&persisted) != nil || !reflect.DeepEqual(persisted.State, warning.State) || persisted.ServerTime < warning.ServerTime {
		t.Fatal("HTTP reload lost announced breath or server clock")
	}
	_, err = s.DB.Exec(ctx, `UPDATE heroes SET expires_at=now()-interval '1 second' WHERE token_hash=$1`, hash[:])
	if err != nil {
		t.Fatal(err)
	}
	expired := request("GET", "/api/game", "", cookie)
	defer expired.Body.Close()
	if expired.StatusCode != 401 {
		t.Fatal("expired session accepted")
	}
}
