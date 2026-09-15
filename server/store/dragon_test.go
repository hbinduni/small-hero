package store

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"smallhero/server/game"
)

func dragonStore(t *testing.T) (*Store, context.Context, string, game.Response) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL required for real PostgreSQL test")
	}
	ctx := context.Background()
	s, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.DB.Close)
	token, initial, err := s.Create(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.DB.Exec(ctx, `DELETE FROM heroes WHERE token_hash=$1`, hash(token)) })
	return s, ctx, token, initial
}

func saveFixture(t *testing.T, s *Store, ctx context.Context, token string, state game.State) {
	t.Helper()
	raw, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.Exec(ctx, `UPDATE heroes SET state=$1 WHERE token_hash=$2`, raw, hash(token)); err != nil {
		t.Fatal(err)
	}
}

func TestDragonResponseClock(t *testing.T) {
	_, _, _, initial := dragonStore(t)
	for _, response := range []game.Response{initial} {
		raw, _ := json.Marshal(response)
		var wire struct {
			ServerTime int64 `json:"serverTime"`
		}
		if err := json.Unmarshal(raw, &wire); err != nil || wire.ServerTime < time.Now().Add(-time.Minute).UnixMilli() || wire.ServerTime > time.Now().UnixMilli() {
			t.Fatalf("response has no usable server clock: %s, %v", raw, err)
		}
	}
}

func TestDragonLegacyLoad(t *testing.T) {
	s, ctx, token, initial := dragonStore(t)
	legacy := initial.State
	legacy.Enemies = legacy.Enemies[:3]
	for i := range legacy.Enemies {
		legacy.Enemies[i].Kind = ""
		legacy.Enemies[i].Name = ""
	}
	legacy.Gold, legacy.XP, legacy.Kills = 321, 78, 2
	legacy.Inventory["ember"] = 7
	saveFixture(t, s, ctx, token, legacy)
	loaded, err := s.Get(ctx, token)
	if err != nil || len(loaded.State.Enemies) != 4 || loaded.State.Enemies[3].Kind != "dragon" || loaded.State.Gold != 321 || loaded.State.XP != 78 || loaded.State.Kills != 2 || loaded.State.Inventory["ember"] != 7 || loaded.State.Version != 0 {
		t.Fatalf("legacy load did not add encounter and preserve progress: %+v, %v", loaded.State, err)
	}
	command := game.Command{ID: "88888888-8888-4888-8888-888888888881", Type: "tick", Version: 0}
	updated, err := s.Command(ctx, token, command)
	if err != nil {
		t.Fatal(err)
	}
	var persisted game.State
	var raw []byte
	if err = s.DB.QueryRow(ctx, `SELECT state FROM heroes WHERE token_hash=$1`, hash(token)).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &persisted); err != nil || len(persisted.Enemies) != 4 || !reflect.DeepEqual(persisted, updated.State) {
		t.Fatalf("upgrade not persisted: %v", err)
	}
}

func TestDragonTickTransactionsPreserveReplayAndRejection(t *testing.T) {
	s, ctx, token, initial := dragonStore(t)
	state := initial.State
	state.Position = game.Point{X: 1355, Y: 300}
	now := time.Now().UnixMilli()
	state.Enemies[3].Breath = &game.Breath{Origin: game.Point{X: 1355, Y: 200}, Aim: state.Position, StartsAt: now - 100, EndsAt: now + 60000}
	state.Enemies[3].NextBreathAt = now + 62400
	saveFixture(t, s, ctx, token, state)
	bad := game.Command{ID: "88888888-8888-4888-8888-888888888882", Type: "craft", Target: "flame_blade", Version: 0}
	if _, err := s.Command(ctx, token, bad); !errors.Is(err, game.ErrAction) {
		t.Fatalf("invalid action: %v", err)
	}
	after, err := s.Get(ctx, token)
	if err != nil || !reflect.DeepEqual(after.State, state) {
		t.Fatalf("rejection advanced fire: %v", err)
	}
	command := game.Command{ID: "88888888-8888-4888-8888-888888888883", Type: "tick", Version: 0}
	responses := make([]game.Response, 12)
	errs := make([]error, 12)
	var wg sync.WaitGroup
	for i := range responses {
		wg.Add(1)
		go func() { defer wg.Done(); responses[i], errs[i] = s.Command(ctx, token, command) }()
	}
	wg.Wait()
	for i := range responses {
		if errs[i] != nil || responses[i].State.HP != 72 || responses[i].State.Version != 1 || !responses[i].State.Enemies[3].Breath.Hit || !reflect.DeepEqual(responses[i], responses[0]) {
			t.Fatalf("concurrent tick replay %d: %+v, %v", i, responses[i], errs[i])
		}
	}
	command.ID = "88888888-8888-4888-8888-888888888884"
	if _, err = s.Command(ctx, token, command); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale tick: %v", err)
	}
	command.Version = 1
	advanced, err := s.Command(ctx, token, command)
	if err != nil || advanced.State.HP != 72 || advanced.State.Version != 2 {
		t.Fatalf("fresh tick repeated damage: %+v, %v", advanced.State, err)
	}
	replay, err := s.Command(ctx, token, game.Command{ID: "88888888-8888-4888-8888-888888888883", Type: "tick", Version: 0})
	if err != nil || !reflect.DeepEqual(replay, responses[0]) {
		t.Fatalf("historical receipt changed: %v", err)
	}
	if _, err = s.Command(ctx, token, game.Command{ID: "88888888-8888-4888-8888-888888888883", Type: "rest", Version: 0}); !errors.Is(err, ErrReplay) {
		t.Fatalf("altered tick replay: %v", err)
	}
	var count int
	if err = s.DB.QueryRow(ctx, `SELECT count(*) FROM command_receipts r JOIN heroes h ON h.id=r.hero_id WHERE h.token_hash=$1`, hash(token)).Scan(&count); err != nil || count != 2 {
		t.Fatalf("receipt count %d, %v", count, err)
	}
}

func TestConcurrentDragonKillsRewardOnce(t *testing.T) {
	s, ctx, token, initial := dragonStore(t)
	state := initial.State
	state.Position = game.Point{X: 1355, Y: 300}
	state.Enemies[3].HP = 12
	saveFixture(t, s, ctx, token, state)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i, id := range []string{"99999999-9999-4999-8999-999999999991", "99999999-9999-4999-8999-999999999992"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = s.Command(ctx, token, game.Command{ID: id, Version: 0, Type: "attack", Target: "cinderwing"})
		}()
	}
	wg.Wait()
	wins, conflicts := 0, 0
	for _, err := range errs {
		if err == nil {
			wins++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	after, err := s.Get(ctx, token)
	if err != nil || wins != 1 || conflicts != 1 || after.State.Gold != 180 || after.State.Inventory["ember"] != 3 || after.State.Kills != 0 || after.State.Version != 1 {
		t.Fatalf("concurrent kill rewards: %+v wins%d conflicts%d, %v", after.State, wins, conflicts, err)
	}
}
