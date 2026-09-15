import { distance } from '../game/navigation';
import type { Snapshot } from './client';
import type { GameState, Point, Recipe } from './types';

export function getForgeStatus(
  state: Pick<GameState, 'inventory' | 'gold' | 'level' | 'position'>,
  recipe: Recipe,
  smithy: Point,
  connection: Snapshot['connection'],
  pending: number,
) {
  if (connection !== 'online') return 'offline';
  if (pending > 0) return 'working';
  if (
    Object.entries(recipe.cost).some(
      ([id, count]) => (state.inventory[id] ?? 0) < count,
    )
  )
    return 'materials';
  if (state.gold < recipe.gold) return 'gold';
  if (state.level < recipe.requiredLevel) return 'level';
  if (distance(state.position, smithy) > 100) return 'travel';
  return 'ready';
}
