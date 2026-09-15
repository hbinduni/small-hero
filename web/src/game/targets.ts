import type { Point, WorldTarget } from '../lib/types';
import { distance } from './navigation';

export function pointerTarget(
  point: Point,
  targets: WorldTarget[],
): WorldTarget | undefined {
  return targets
    .filter(
      (target) =>
        distance({ x: target.x, y: target.y - 24 }, point) <
        (target.hitRadius ?? 55),
    )
    .sort(
      (a, b) =>
        distance({ x: a.x, y: a.y - 24 }, point) -
        distance({ x: b.x, y: b.y - 24 }, point),
    )[0];
}
