# Cinderwing miniboss

Add a small dragon encounter to the existing single-player village. The dragon lives on the northeast trail near (1355, 200), away from the camp and resource nodes. Existing guest saves must acquire the encounter without resetting inventory or progress.

## Encounter

- Cinderwing: 240 HP. Click to approach and attack with the existing weapon controls.
- Entering a 240-unit radius engages the dragon. It stays at its lair.
- Fire breath: lock aim at the hero, warn for 1.4 seconds, then breathe fire for 0.7 seconds in a 260-unit, 60-degree cone. One breath can deal 28 damage once. Recovery lasts 2.4 seconds before a new warning.
- Fire damage and timing are decided by Go. The browser sends serialized `tick` commands during an encounter so the dragon attacks even when the hero stands still. Fire warnings and flames use the same persisted origin, aim, and timestamps as the damage rule.
- Moving out of the cone avoids damage. Retreat outside the engagement radius ends the encounter after an already-announced attack finishes. Returning to camp remains safe.
- Defeat rewards 100 gold, 120 XP, and 3 ember shards once per kill. Respawn after 60 seconds. Dragon kills do not count as moss slime kills for Bram's quest.
- Defeat of the hero uses the existing rescue policy. No retroactive fire hits while offline: once `endsAt` has passed, that breath cannot deal damage. The next nearby command starts a fresh warning after recovery; missed cycles are not replayed.

## Implementation and verification

1. Backend: extend enemy encounter state, migrate older saves safely, support ticks, validate fire geometry and deadlines, distinguish rewards, preserve command replay semantics. Cover damage, dodge, one-hit limit, defeat, respawn, old saves, invalid commands, and stale/replayed commands.
2. Frontend: original dragon sprite, health bar, clear warning cone, animated fire breath, dodge guidance, serialized encounter ticks, disposal cleanup, existing attack targeting and journal/map hints.
3. Run project checks and real PostgreSQL tests. Play through warning, hit, dodge, defeat/reward, and save/reload. Keep the local game running.

## Progress

- Backend: complete, including existing-save upgrades and PostgreSQL receipt/concurrency tests.
- Frontend and art: complete. Original four-pose dragon, warning cone, animated flames, boss health panel, map hint, and movement-aware encounter commands.
- Review: complete. Healing and equipping flush movement before resolving fire. Encounter cadence uses request dispatch time, while visual deadlines use a monotonic server clock adjusted for measured latency. Scene disposal prevents deferred commands after leaving the adventure.
- Verification: see [verification.md](verification.md).
