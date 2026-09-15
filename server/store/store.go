package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"smallhero/server/game"
)

var ErrSession = errors.New("session expired")
var ErrConflict = errors.New("state version changed")
var ErrReplay = errors.New("command ID reused with different input")

type Store struct{ DB *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	s := &Store{pool}
	if err = s.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}
func (s *Store) migrate(ctx context.Context) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(728145920);`); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS heroes (id bigserial PRIMARY KEY, token_hash bytea UNIQUE NOT NULL, expires_at timestamptz NOT NULL, state jsonb NOT NULL); CREATE TABLE IF NOT EXISTS command_receipts (hero_id bigint NOT NULL REFERENCES heroes(id) ON DELETE CASCADE, command_id uuid NOT NULL, command jsonb NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(hero_id,command_id));`)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func hash(token string) []byte { sum := sha256.Sum256([]byte(token)); return sum[:] }
func (s *Store) Create(ctx context.Context) (string, game.Response, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", game.Response{}, err
	}
	token := hex.EncodeToString(b)
	now := time.Now()
	state := game.New(now)
	raw, err := json.Marshal(state)
	if err != nil {
		return "", game.Response{}, err
	}
	_, err = s.DB.Exec(ctx, `INSERT INTO heroes(token_hash,expires_at,state) VALUES($1,$2,$3)`, hash(token), time.Now().Add(30*24*time.Hour), raw)
	return token, game.Response{State: state, ServerTime: now.UnixMilli(), Catalog: game.CatalogData, Message: "Welcome to Elderwood."}, err
}
func (s *Store) Get(ctx context.Context, token string) (game.Response, error) {
	var raw []byte
	err := s.DB.QueryRow(ctx, `SELECT state FROM heroes WHERE token_hash=$1 AND expires_at>now()`, hash(token)).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return game.Response{}, ErrSession
	}
	if err != nil {
		return game.Response{}, err
	}
	var state game.State
	if err = json.Unmarshal(raw, &state); err != nil {
		return game.Response{}, err
	}
	return game.Response{State: game.Upgrade(state), ServerTime: time.Now().UnixMilli(), Catalog: game.CatalogData, Message: "Adventure restored."}, nil
}
func (s *Store) Command(ctx context.Context, token string, c game.Command) (game.Response, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return game.Response{}, err
	}
	defer tx.Rollback(ctx)
	var id int64
	var raw []byte
	err = tx.QueryRow(ctx, `SELECT id,state FROM heroes WHERE token_hash=$1 AND expires_at>now() FOR UPDATE`, hash(token)).Scan(&id, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return game.Response{}, ErrSession
	}
	if err != nil {
		return game.Response{}, err
	}
	commandJSON, err := json.Marshal(c)
	if err != nil {
		return game.Response{}, err
	}
	var responseJSON []byte
	var identical bool
	err = tx.QueryRow(ctx, `SELECT response,command=$3::jsonb FROM command_receipts WHERE hero_id=$1 AND command_id=$2`, id, c.ID, commandJSON).Scan(&responseJSON, &identical)
	if err == nil {
		if !identical {
			return game.Response{}, ErrReplay
		}
		var response game.Response
		if err = json.Unmarshal(responseJSON, &response); err != nil {
			return game.Response{}, err
		}
		return response, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return game.Response{}, err
	}
	var state game.State
	if err = json.Unmarshal(raw, &state); err != nil {
		return game.Response{}, err
	}
	if state.Version != c.Version {
		return game.Response{}, ErrConflict
	}
	now := time.Now()
	state, event, err := game.Apply(state, c, now)
	if err != nil {
		return game.Response{}, err
	}
	response := game.Response{State: state, ServerTime: now.UnixMilli(), Catalog: game.CatalogData, Event: event, Message: message(event)}
	stateJSON, err := json.Marshal(state)
	if err != nil {
		return game.Response{}, err
	}
	responseJSON, err = json.Marshal(response)
	if err != nil {
		return game.Response{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE heroes SET state=$1 WHERE id=$2`, stateJSON, id); err != nil {
		return game.Response{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO command_receipts(hero_id,command_id,command,response) VALUES($1,$2,$3,$4)`, id, c.ID, commandJSON, responseJSON); err != nil {
		return game.Response{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return game.Response{}, fmt.Errorf("save command: %w", err)
	}
	return response, nil
}
func message(event string) string {
	switch event {
	case "gather":
		return "Gathered 2 resources."
	case "defeat":
		return "Slime defeated! +1 ember, +15 gold, +30 XP."
	case "dragon_defeat":
		return "Cinderwing defeated! +3 ember, +100 gold, +120 XP."
	case "fire_hit":
		return "Cinderwing's fire breath hit you for 28 health."
	case "rescue":
		return "Rescued at camp. You lost 10% of your gold."
	case "craft":
		return "Weapon forged."
	case "equip":
		return "Weapon equipped."
	case "heal":
		return "Health restored."
	case "rest":
		return "Rested at camp."
	case "claim":
		return "Quest completed! +100 gold."
	case "attack", "heavy_attack":
		return "Strike landed."
	default:
		return ""
	}
}
