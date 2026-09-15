import { expect, test } from 'bun:test';
import type { Enemy } from '../lib/types';
import { breathCone, breathPhase, needsDragonTick } from './dragon';

const dragon: Enemy = {
  id: 'cinderwing',
  kind: 'dragon',
  x: 1355,
  y: 200,
  hp: 240,
  maxHp: 240,
  respawnAt: 0,
  breath: {
    origin: { x: 1355, y: 200 },
    aim: { x: 1255, y: 200 },
    startsAt: 2400,
    endsAt: 3100,
    hit: false,
  },
  nextBreathAt: 5500,
};
test('fire warning, active fire, and recovery use exact server deadlines', () => {
  expect(breathPhase(dragon, 2399)).toBe('warning');
  expect(breathPhase(dragon, 2400)).toBe('fire');
  expect(breathPhase(dragon, 3100)).toBe('recovering');
  expect(breathPhase({ ...dragon, hp: 0 }, 2500)).toBe('defeated');
});
test('an announced breath continues ticking after retreat, while a quiet distant lair does not', () => {
  expect(needsDragonTick(dragon, { x: 760, y: 540 })).toBe(true);
  expect(
    needsDragonTick({ ...dragon, breath: undefined }, { x: 760, y: 540 }),
  ).toBe(false);
  expect(
    needsDragonTick({ ...dragon, breath: undefined }, { x: 1300, y: 250 }),
  ).toBe(true);
});
test('the warning fan has the same locked origin, range, and 60 degree spread as fire damage', () => {
  const points = breathCone({ x: 0, y: 0 }, { x: 100, y: 0 });
  expect(points[0]).toEqual({ x: 0, y: 0 });
  expect(points[1].y).toBeCloseTo(-130);
  expect(points.at(-1)?.y).toBeCloseTo(130);
  expect(points[13].x).toBeCloseTo(260);
});
