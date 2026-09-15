package store

import (
	"context"
	"errors"
	"os"
	"reflect"
	"sync"
	"testing"

	"smallhero/server/game"
)

func TestTransactions(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL required for real PostgreSQL test")
	}
	ctx := context.Background()
	s, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer s.DB.Close()
	token, initial, err := s.Create(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = s.DB.Exec(ctx, `DELETE FROM heroes WHERE token_hash=$1`, hash(token)) }()
	c := game.Command{ID: "11111111-1111-4111-8111-111111111111", Version: initial.State.Version, Type: "rest"}
	var wg sync.WaitGroup
	responses := make([]game.Response, 12)
	errs := make([]error, 12)
	for i := range responses {
		wg.Add(1)
		go func() { defer wg.Done(); responses[i], errs[i] = s.Command(ctx, token, c) }()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
		if responses[i].State.Version != 1 || !reflect.DeepEqual(responses[0], responses[i]) {
			t.Fatal("non-deterministic duplicate")
		}
	}
	c.Type = "heal"
	if _, err = s.Command(ctx, token, c); !errors.Is(err, ErrReplay) {
		t.Fatalf("different input: %v", err)
	}
	c.ID = "22222222-2222-4222-8222-222222222222"
	c.Type = "rest"
	if _, err = s.Command(ctx, token, c); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale command: %v", err)
	}
	c.Version = 1
	c.Type = "craft"
	c.Target = "flame_blade"
	if _, err = s.Command(ctx, token, c); !errors.Is(err, game.ErrAction) {
		t.Fatalf("invalid craft: %v", err)
	}
	after, err := s.Get(ctx, token)
	if err != nil || !reflect.DeepEqual(after.State, responses[0].State) {
		t.Fatalf("rejected transaction changed state: %v", err)
	}
	var count int
	if err = s.DB.QueryRow(ctx, `SELECT count(*) FROM command_receipts r JOIN heroes h ON h.id=r.hero_id WHERE h.token_hash=$1`, hash(token)).Scan(&count); err != nil || count != 1 {
		t.Fatalf("receipts %d %v", count, err)
	}
	// Distinct valid commands at the same version serialize: exactly one can win.
	wg = sync.WaitGroup{}
	errs = make([]error, 2)
	for i, id := range []string{"33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = s.Command(ctx, token, game.Command{ID: id, Version: 1, Type: "rest"})
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
	if wins != 1 || conflicts != 1 {
		t.Fatalf("wins %d conflicts %d", wins, conflicts)
	}
	replayed, err := s.Command(ctx, token, game.Command{ID: "11111111-1111-4111-8111-111111111111", Version: 0, Type: "rest"})
	if err != nil || !reflect.DeepEqual(replayed, responses[0]) {
		t.Fatalf("old receipt replay changed: %v", err)
	}
}
