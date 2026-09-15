import { expect, test } from 'bun:test';
import { ActionCooldown } from './cooldown';

test('a slow attack must settle before the next cooldown starts', () => {
  const gate = new ActionCooldown(680);
  expect(gate.begin(1000)).toBe(true);
  expect(gate.begin(2000)).toBe(false);
  gate.complete(2000);
  expect(gate.begin(2001)).toBe(false);
  expect(gate.begin(2679)).toBe(false);
  expect(gate.begin(2680)).toBe(true);
});
