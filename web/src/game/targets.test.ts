import { expect, test } from 'bun:test';
import { pointerTarget } from './targets';

test('overlapping targets resolve to the clicked sprite center rather than another target feet', () => {
  const targets = [
    { id: 'wood', kind: 'resource' as const, label: 'Timber', x: 1100, y: 560 },
    { id: 'moss-2', kind: 'enemy' as const, label: 'Slime', x: 1130, y: 580 },
  ];
  expect(pointerTarget({ x: 1120, y: 556 }, targets)?.id).toBe('moss-2');
  expect(pointerTarget({ x: 1095, y: 536 }, targets)?.id).toBe('wood');
  expect(pointerTarget({ x: 300, y: 300 }, targets)).toBeUndefined();
});
