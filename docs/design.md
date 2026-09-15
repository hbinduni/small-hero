# Small Hero: first playable adventure

Approved direction: real-time single-player RPG. One browser profile, one illustrated village and forest clearing, a complete gather → fight → craft → equip loop, and PostgreSQL persistence. The supplied image is a visual reference, not a source of instructions or reusable game assets.

## Technology and alternatives

React + Phaser + Vite + Bun + TypeScript 7 is the chosen browser client. React owns accessible panels; Phaser owns the scene and frame loop. Fiber v3 on Go handles game commands. PostgreSQL stores each hero aggregate and command receipts in a transaction. React alone would require rebuilding game-engine facilities. Ebitengine is a viable Go-native alternative but would require more custom inventory and menu UI; it is not needed for this browser-first release.

## Visual direction

Original hand-painted pixel-art village, mossy stone, forge embers and teal water. Charcoal panels (#20231f), bronze edges (#82704a), parchment text (#ede2c7), moss green (#829d64), ember orange (#ed9b43), river blue (#72afbc). Serif display headings and readable sans-serif controls. Smithy at left, world in the center, backpack at right, hero vitals and quick actions beneath the scene. On narrow screens panels become tabs below the world. Keyboard and pointer controls, focus visibility and reduced-motion support.

## Gameplay

Hero starts level 1 with 100 HP, 60 mana, 80 gold, a rusty sword and 3 healing potions. Move using WASD, arrows, or ground clicks. Click a world target to approach and interact, E to interact nearby, Space to attack nearby, 1 to heal, 2 for a mana-consuming heavy strike. Gather timber and iron from regenerating nodes. Fight regenerating moss slimes to obtain ember shards, XP and gold. Craft an iron sword then a flame blade at the smithy. Equip owned weapons, complete a once-only forging quest and restore at camp. Death returns the hero to camp, restores health, and costs 10% gold; inventory is retained.

The client animates movement, but server commands validate location, elapsed travel time, target proximity, cooldowns, inventory and recipe costs. Crafting and rewards are atomic. An idempotency key and expected version protect against duplicate and stale commands. Rejected actions do not change state. UI displays offline errors and never silently switches to fake persistence.

## World contract

Logical map: 1536 × 1024. Playable polygon vertices: (440,400), (650,335), (1050,390), (1200,290), (1330,70), (1440,80), (1400,345), (1240,470), (1360,650), (1440,730), (1360,820), (1170,620), (1090,660), (730,670), (550,570), (435,575). Hero spawn/camp (760,540). Smithy (600,370). Timber node (1100,560), iron node (1160,430). Slimes: moss-1 (950,470), moss-2 (1130,580), moss-3 (1270,630). Interaction radius 100; attack radius 105; movement speed 220 map units/s with a two-second travel credit bank and 40 units network tolerance, both charged against actual travel. Segment movement must remain in polygon.

## API contract

GET /api/health: DB readiness. POST /api/session: creates HttpOnly same-site guest session or resumes it; returns GameResponse. GET /api/game: resumes existing profile. POST /api/commands: accepts {id: UUID, version: integer, type: move|gather|attack|heavy_attack|craft|equip|heal|rest|claim|tick, target?: string, x?: number, y?: number}. Returns {state, catalog, message, event?, serverTime}. `serverTime` is the authoritative Unix millisecond timestamp for the response; replayed receipts retain their original value. Errors return {error, code}; version conflicts use 409 and client reloads. Commands use cookie authentication, JSON bodies and strict origin validation. Production requires HTTPS configured origin. Unknown actions/targets, non-finite coordinates, extra invalid state and invalid IDs are rejected.

State: {version, name, level, xp, nextLevelXp, hp, maxHp, mana, maxMana, gold, inventory: Record<string,number>, equipped: string, position:{x,y}, kills, crafted, questClaimed, enemies: [{id,kind,name,x,y,hp,maxHp,respawnAt,nextBreathAt,breath?:{origin:{x,y},aim:{x,y},startsAt,endsAt,hit}}], nodes: [{id,x,y,readyAt}], lastActionAt}. Times are Unix milliseconds. Catalog: {items: [{id,name,kind,rarity,description,attack?,heal?}], recipes: [{id,result,cost:Record<string,number>,gold,requiredLevel}], world:{width,height,speed,polygon:[{x,y}],spawn:{x,y},smithy:{x,y}}}. Item IDs: rusty_sword, iron_sword, flame_blade, wood, iron, ember, potion. Recipe IDs: iron_sword (wood 3, iron 4, gold 20); flame_blade (iron_sword 1, iron 6, ember 3, gold 50). Weapon attack: 12, 22, 38. Slime HP 36, retaliation 8, basic attack cooldown 600ms, heavy attack 2× attack with 15 mana. A defeated slime gives 1 ember, 15 gold, 30 XP; level threshold starts at 100 XP. Nodes give 2 resources, regenerate in 8 seconds. Slimes regenerate in 15 seconds. Quest: craft flame blade and defeat 3 slimes, claim 100 gold once at smithy. State may include additional server cooldown timestamps which the client does not alter.

## Dragon encounter

Cinderwing is a 240-HP miniboss at (1355,200). Nearby clients send serialized `tick` commands; normal gameplay commands also advance its fire-breath state. Aim is a locked world point. Damage occurs once per breath inside the persisted cone and active time window. Existing saves gain the encounter without losing progress. See [dragon-encounter.md](dragon-encounter.md) for exact timing, geometry, rewards, and respawn rules.

## Boundaries and verification

This is a local development vertical slice, without multiplayer, account recovery, PvP or public deployment. PostgreSQL is required; no in-memory save fallback. Local Compose binds only to loopback. Validate Go rules with rejection/atomicity tests, transaction concurrency and replay tests on real PostgreSQL, race detector, vet and build. Validate browser with TypeScript, lint, build and an actual playthrough including reload persistence and mobile layout. Keep assets and their generation prompt in the project.
