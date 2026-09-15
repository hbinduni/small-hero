# Small Hero

A browser RPG set in Elderwood: a woodland smithy, a small hero, and a blade waiting to be forged.

![Elderwood village](web/public/art/elderwood.png)

## Play locally

Requires Bun 1.4+, Go 1.27+, and Docker with Compose. All services bind to loopback.

```sh
make setup
make dev
```

Open **http://127.0.0.1:5173**. Use this exact host: `APP_ORIGIN` checks the browser origin. The API runs at `127.0.0.1:8080`; PostgreSQL runs at `127.0.0.1:55432`.

`make setup` installs the pinned dependencies, copies `.env.example` only when `.env` does not exist, and starts the dedicated PostgreSQL container. `make dev` runs the API and Vite together. Ctrl+C stops the app processes. PostgreSQL remains running; stop it with `docker compose stop db`. The named volume preserves progress. The Compose credentials are exclusively for this loopback development database.

To run services separately:

```sh
docker compose up -d --wait db
# Terminal 1: export the three values from .env, then:
cd server && go run ./cmd/server
# Terminal 2, at the repository root:
bun run dev
```

There is no browser-only save fallback. If PostgreSQL or the API is unavailable, the game shows a connection error and a reconnect action.

## The first adventure

- Move with **WASD**, **arrow keys**, or a ground click.
- Click **timber** or **iron** to approach and gather. Nodes replenish after 8 seconds.
- Click a **moss slime** to approach and attack repeatedly. Movement cancels pursuit. Slimes return after 15 seconds.
- **Space** attacks once; **2** uses a heavy strike for 15 mana; **1** drinks a healing potion.
- **E** interacts with the nearest target. **Rest** walks to camp and fully restores health and mana.
- Forge an **iron sword** from 3 timber, 4 iron, and 20 gold. Equip it in the backpack.
- Forge a **flame blade** from the iron sword, 6 iron, 3 ember shards, and 50 gold.
- Defeat 3 slimes and forge the flame blade, then claim Bram’s 100-gold quest reward at his forge.
- Find **Cinderwing**, the dragon miniboss on the northeast trail. Step outside its orange warning cone before the fire breath, then attack during recovery. Defeating it awards 100 gold, 120 XP, and 3 embers; it returns after 60 seconds.

Defeat returns the hero to camp and costs 10% of gold. Items stay in the backpack. A guest cookie resumes the same hero after reload for 30 days; clearing cookies, expiry, or switching browsers starts a new hero. Account recovery and cross-device saves are not part of this first version.

## Stack and structure

| Layer | Technology | Location |
| --- | --- | --- |
| Interface | React 19, Vite 8, Bun, TypeScript 7.0.2 | `web/src/components` |
| World | Phaser 4.2.1; polygon navigation and original pixel artwork | `web/src/game` |
| API | Go 1.27, Fiber 3.5.0 | `server/api`, `server/cmd/server` |
| Game rules | Validated state transitions, cooldowns, crafting, leveling | `server/game` |
| Saves | PostgreSQL 18.6, pgx v5, atomic command receipts | `server/store` |

The server checks travel time, walkable paths, interaction distance, resource costs and cooldowns. Each accepted command updates the hero and its receipt in one transaction. Optimistic versions reject stale commands; repeated receipt IDs replay the original response. Guest secrets are hashed in PostgreSQL and carried in HttpOnly/SameSite cookies. The React client serializes commands, retries a lost response using the same receipt ID, and discards obsolete queued movement after reconciliation.

The browser paints movement immediately and commits position along the route. A sudden tab close can lose the final fraction of a second of unsent movement; completed actions persist. Slimes retaliate when struck. Cinderwing attacks nearby heroes on a timed fire-breath cycle, with server-validated damage and a warning cone that can be dodged. This is single-player, with one map, one quest, and one miniboss. It is not configured for public deployment or multiplayer.

## Checks

```sh
make check-all

# Include real PostgreSQL transaction and HTTP/session tests:
TEST_DATABASE_URL='postgres://smallhero:smallhero_dev@127.0.0.1:55432/smallhero?sslmode=disable' make check-db

# Build browser assets and API binary:
make build
```

Without `TEST_DATABASE_URL`, database integration tests explicitly skip. Tests cover state rejection atomicity, recipe costs, movement boundaries, combat cooldowns, dragon fire geometry and timing, quest replay, session persistence, duplicate/concurrent commands, stale versions, client reconnect reconciliation, and response-loss retries.

## Artwork and design

The attached reference informed the isometric village and crafting/inventory layout. The shipped village and sprite atlas are original generated assets. Prompts and provenance are in [docs/artwork.md](docs/artwork.md). Fonts are bundled locally; no runtime third-party asset calls are needed.

See [design](docs/design.md), [implementation plan](docs/implementation-plan.md), [verification results](docs/verification.md), and [API details](server/README.md).
