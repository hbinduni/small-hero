import type { Enemy, Point } from '../lib/types';
import { distance } from './navigation';

export const DRAGON_ID = 'cinderwing';
export const BREATH_RANGE = 260;
export const BREATH_HALF_ANGLE = Math.PI / 6;

export function breathPhase(dragon: Enemy, now: number) {
  if (dragon.hp <= 0) return 'defeated';
  if (dragon.breath && now < dragon.breath.endsAt) {
    return now < dragon.breath.startsAt ? 'warning' : 'fire';
  }
  return (dragon.nextBreathAt ?? 0) > now ? 'recovering' : 'idle';
}

export function needsDragonTick(dragon: Enemy | undefined, position: Point) {
  return !!dragon && (distance(dragon, position) <= 300 || !!dragon.breath);
}

export function breathCone(origin: Point, aim: Point): Point[] {
  const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
  return [
    origin,
    ...Array.from({ length: 25 }, (_, i) => {
      const a = angle - BREATH_HALF_ANGLE + (BREATH_HALF_ANGLE * 2 * i) / 24;
      return {
        x: origin.x + Math.cos(a) * BREATH_RANGE,
        y: origin.y + Math.sin(a) * BREATH_RANGE,
      };
    }),
  ];
}
