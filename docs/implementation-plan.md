# Small Hero implementation plan

**Goal:** Deliver the approved single-player village adventure running locally with real persistent saves.
**Spec:** docs/design.md
**Architecture:** React HUD and Phaser world consume one Go/Fiber command API. PostgreSQL serializes each hero's mutations.
**Constraints:** Bun commands, TypeScript 7.0.2, Fiber 3.5.0, PostgreSQL, strict types, no fake offline saves, no push or deployment.

## Task 1: game server and persistence

- [x] Implement in server/ only. Follow docs/design.md API and item IDs exactly.
- [x] Write and run failure-first gameplay tests for recipe affordability, unowned equipment, cooldowns, range, invalid travel, quest replay, death and unchanged state on rejected commands.
- [x] Implement immutable Apply(state, command, now) transitions and a PostgreSQL transaction repository with row locks, expected versions and command receipts.
- [x] Add Fiber session, health, game and commands endpoints, strict JSON/origin checks, bounded requests and graceful shutdown. Never log credentials.
- [x] Run go test -race ./..., go vet ./..., go build ./... and a database integration test for concurrent duplicate commands and distinct stale commands.

## Task 2: playable scene and interface

- [x] Root owns web/, root configuration and original art. Build desktop and mobile panels with real API state.
- [x] Implement a Phaser scene: click-to-walk, WASD, navigation inside the world polygon, animated hero and creatures, target interactions, damage feedback, particles and hotkeys.
- [x] Implement a serial command client that flushes movement before proximity actions; recover from version conflicts by refreshing state and expose retry for network errors.
- [x] Implement inventory selection/equip, recipe affordability/crafting, quest claim, rest and quick actions. No inert advertised buttons.
- [x] Run strict typecheck, lint, production build and focused navigation/client tests.

## Task 3: integration, review and delivery

- [x] Run isolated local PostgreSQL with Compose and API/Vite processes on loopback.
- [x] Play through movement, gathering, fight, crafting, equip, healing, save/reload and small-screen navigation.
- [x] Review full implementation for validation gaps and gameplay dead ends. Fix findings and rerun affected checks.
- [x] Document exact run commands, API boundary, generated art prompt, known limitations and next expansion points. Show playable result in Codex.

Results and scope are recorded in [verification.md](verification.md).
