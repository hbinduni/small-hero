# Small Hero API

Go 1.27.1, Fiber v3.5.0 and pgx v5. PostgreSQL is mandatory. The server initializes its two tables under a transaction-scoped migration lock at startup; failed database startup stops the process.

## Run locally

Start the repository's PostgreSQL Compose service first, then run from `server/`:

```sh
export DATABASE_URL='postgres://smallhero:smallhero_dev@127.0.0.1:55432/smallhero?sslmode=disable'
export APP_ORIGIN='http://127.0.0.1:5173'
export API_ADDR='127.0.0.1:8080'
go run ./cmd/server
```

The password above belongs only to the isolated local development database. Use an HTTPS `APP_ORIGIN` outside loopback development. The frontend uses the Vite `/api` proxy; no cross-origin CORS setup is needed. POST requests require matching Origin, `Content-Type: application/json`, and a JSON object. Session creation/resumption accepts `{}`.

## Contract

The public state/catalog/command contract is in `../docs/design.md`. Additional internal state timestamps are `lastMoveAt` and `lastAttackAt`; all timestamps use Unix milliseconds. Nodes have IDs `wood` and `iron`. `event` is an optional string: `move`, `gather`, `attack`, `heavy_attack`, `craft`, `equip`, `heal`, `rest`, `claim`, `defeat`, `rescue`, `tick`, `fire_hit`, or `dragon_defeat`. Responses include `serverTime`, the authoritative calculation time in Unix milliseconds; stored receipt replays preserve that original timestamp.

- `GET /api/health`: live database readiness; 200 or 503.
- `POST /api/session`: create or resume the guest profile using `{}`.
- `GET /api/game`: restore the authenticated save.
- `POST /api/commands`: apply a UUID command with its expected state version.

Errors use `{error, code}`. Invalid JSON/commands: 400; missing session: 401; bad origin: 403; version/receipt conflict: 409; content type: 415; unavailable gameplay action: 422; rate limit: 429; unavailable database: 503. Bodies are capped at 2 KiB. Unknown, duplicate, null and case-variant command fields are rejected.

Sessions use 256-bit random tokens, stored only as SHA-256 hashes in PostgreSQL. Cookies expire after 30 days, are HttpOnly, SameSite=Strict, Path=/api, and Secure for HTTPS origins. The database independently enforces expiration. There is no account recovery or cross-browser login.

`heroes` stores each JSONB game aggregate. `command_receipts` stores canonical command input and the full original response, keyed by hero and UUID. Commands lock their hero row before checking receipts and versions. A duplicate command returns its exact original response even after later saves; reusing its ID with different input fails. Rejected commands change neither state nor receipts. Successful state and receipt writes commit together.

Movement validates the whole segment against the concave playable polygon and retains up to two seconds (440 units) of earned travel for delayed command bursts. Its 40-unit network tolerance is charged against subsequent movement, so repeated requests cannot create free travel. Combat, node regeneration, recipes, proximity, mana, equipment ownership and quest rewards are server-authoritative. Defeat returns to camp and retains items; `game/death_policy.go` implements the approved 10% integer gold loss. Level thresholds are 100 × current level; leveling adds 10 max health and 5 max mana and restores both.

Cinderwing is a stationary miniboss whose persisted breath state contains an origin, locked world aim point, start/end timestamps, and a one-hit flag. Both `tick` and normal commands advance the encounter. A valid move is applied before testing fire damage, so dodges use the submitted position. Expired breaths do not deal retroactive damage. Defeat gives its reward once and does not advance the slime quest counter. Existing hero snapshots are upgraded on read and the next accepted command persists the upgrade. See `../docs/dragon-encounter.md` for encounter rules.

## Verification

Run from `server/`:

```sh
export TEST_DATABASE_URL="$DATABASE_URL"
go test -race ./...
go vet ./...
go build ./...
```

Verified on 2026-09-15 against the isolated local PostgreSQL 18.6 database:

- Pure gameplay rejection/immutability, insufficient resources, consumed equipped weapon replacement, basic/heavy attack, cooldown boundaries, mana, death, quest replay, node/enemy regeneration and concave movement validation. Regression tests replay a recorded delayed movement burst and verify the two-second travel bank remains bounded and fully charged.
- Twelve concurrent duplicate commands produce one saved version and one receipt, with identical responses. Distinct concurrent commands at one version produce one success and one conflict. Different input with a reused ID fails. Rejected crafting leaves the stored state unchanged. Old receipts retain the original response after later mutations.
- Real HTTP guest creation, cookie flags, saved-command reload, session resumption and expired-session rejection. Strict JSON, origin/content type and missing-authentication rejection.
- Race detector, vet and build pass.

Database integration tests explicitly skip if `TEST_DATABASE_URL` is absent; a skipped integration test is not database verification. Test-created heroes and their receipts are deleted after each test.

This local slice has no account recovery, receipt-retention job or multiplayer simulation. Enemy regeneration is materialized when the next successful command runs; the client may display its countdown from `respawnAt`. SIGINT/SIGTERM allows up to eight seconds for graceful HTTP shutdown before closing the pool.
