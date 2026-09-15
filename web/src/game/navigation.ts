import type { Point } from '../lib/types';

export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function inside(point: Point, polygon: Point[]): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  let result = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (
      Math.abs(cross) < 1e-7 &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) &&
      point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)
    )
      return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}

export function segmentInside(
  from: Point,
  to: Point,
  polygon: Point[],
): boolean {
  if (!inside(from, polygon) || !inside(to, polygon)) return false;
  const cuts = [0, 1];
  const dx = to.x - from.x,
    dy = to.y - from.y;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length];
    const ex = q.x - p.x,
      ey = q.y - p.y,
      denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const t = ((p.x - from.x) * ey - (p.y - from.y) * ex) / denominator;
    const u = ((p.x - from.x) * dy - (p.y - from.y) * dx) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  return cuts.slice(1).every((cut, i) => {
    const t = (cut + cuts[i]) / 2;
    return inside({ x: from.x + dx * t, y: from.y + dy * t }, polygon);
  });
}

export function findPath(from: Point, to: Point, polygon: Point[]): Point[] {
  if (!inside(from, polygon) || !inside(to, polygon)) return [];
  if (segmentInside(from, to, polygon)) return [to];
  // A visibility graph uses the real polygon edges, so paths cannot cut through trees.
  const points = [from, to, ...polygon];
  const costs = points.map(() => Infinity),
    previous = points.map(() => -1),
    visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < points.length) {
    let best = -1;
    for (let i = 0; i < points.length; i++)
      if (!visited.has(i) && (best === -1 || costs[i] < costs[best])) best = i;
    if (best === -1 || costs[best] === Infinity) return [];
    if (best === 1) break;
    visited.add(best);
    for (let i = 0; i < points.length; i++) {
      const cost = costs[best] + distance(points[best], points[i]);
      if (
        !visited.has(i) &&
        cost < costs[i] &&
        segmentInside(points[best], points[i], polygon)
      ) {
        costs[i] = cost;
        previous[i] = best;
      }
    }
  }
  const route: Point[] = [];
  for (let i = 1; i !== 0; i = previous[i]) {
    if (i < 0) return [];
    route.unshift(points[i]);
  }
  return route;
}
