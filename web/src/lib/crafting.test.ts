import { expect, test } from 'bun:test';
import { getForgeStatus } from './crafting';
import type { Recipe } from './types';

const recipe: Recipe = {
  id: 'iron_sword',
  result: 'iron_sword',
  cost: { wood: 3, iron: 4 },
  gold: 20,
  requiredLevel: 1,
};
const smithy = { x: 600, y: 370 };
const supplied = {
  inventory: { wood: 3, iron: 4 },
  gold: 20,
  level: 1,
  position: smithy,
};

test('all requirements met at the saved forge position enables crafting', () => {
  expect(getForgeStatus(supplied, recipe, smithy, 'online', 0)).toBe('ready');
});

test('complete supplies away from the forge offer travel instead of a disabled craft action', () => {
  expect(
    getForgeStatus(
      { ...supplied, position: { x: 760, y: 540 } },
      recipe,
      smithy,
      'online',
      0,
    ),
  ).toBe('travel');
});

test('the last required item and gold are checked independently', () => {
  expect(
    getForgeStatus(
      { ...supplied, inventory: { wood: 3, iron: 3 } },
      recipe,
      smithy,
      'online',
      0,
    ),
  ).toBe('materials');
  expect(
    getForgeStatus({ ...supplied, gold: 19 }, recipe, smithy, 'online', 0),
  ).toBe('gold');
});

test('crafting waits for saved movement and cannot run offline', () => {
  expect(getForgeStatus(supplied, recipe, smithy, 'online', 1)).toBe('working');
  expect(getForgeStatus(supplied, recipe, smithy, 'offline', 0)).toBe(
    'offline',
  );
});

test('a future recipe level requirement cannot be bypassed by having its materials', () => {
  expect(
    getForgeStatus(
      supplied,
      { ...recipe, requiredLevel: 2 },
      smithy,
      'online',
      0,
    ),
  ).toBe('level');
});
