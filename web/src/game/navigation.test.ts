import { describe, expect, test } from 'bun:test';
import { findPath, inside, segmentInside } from './navigation';

const polygon = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 40, y: 40 },
  { x: 40, y: 100 },
  { x: 0, y: 100 },
];
describe('walkable navigation', () => {
  test('includes edges and rejects outside points', () => {
    expect(inside({ x: 40, y: 70 }, polygon)).toBe(true);
    expect(inside({ x: 70, y: 70 }, polygon)).toBe(false);
    expect(inside({ x: NaN, y: 5 }, polygon)).toBe(false);
  });
  test('does not cross the notch of a concave clearing', () => {
    expect(segmentInside({ x: 90, y: 30 }, { x: 30, y: 90 }, polygon)).toBe(
      false,
    );
    const route = findPath({ x: 90, y: 30 }, { x: 30, y: 90 }, polygon);
    expect(route.length).toBeGreaterThan(1);
    let cursor = { x: 90, y: 30 };
    for (const point of route) {
      expect(segmentInside(cursor, point, polygon)).toBe(true);
      cursor = point;
    }
    expect(cursor).toEqual({ x: 30, y: 90 });
  });
  test('outside destination cannot produce a route', () => {
    expect(findPath({ x: 10, y: 10 }, { x: 80, y: 80 }, polygon)).toEqual([]);
  });
});
