import { expect, test } from 'bun:test';
import { ServerClock } from './server-clock';

test('local elapsed time advances server deadlines and old receipts cannot rewind them', () => {
  const clock = new ServerClock();
  clock.sample(10000, 100);
  expect(clock.now(800)).toBe(10700);
  clock.sample(9800, 800);
  expect(clock.now(900)).toBe(10800);
  clock.sample(11000, 1100);
  expect(clock.now(1200)).toBe(11100);
});

test('a delayed newer receipt cannot restart an expired warning', () => {
  const clock = new ServerClock();
  clock.sample(10000, 0);
  expect(clock.now(8400)).toBe(18400);
  clock.sample(10400, 8400, 650);
  expect(clock.now(8400)).toBe(18400);
  expect(clock.now(8500)).toBe(18500);
  clock.sample(10400, 8600);
  expect(clock.now(8600)).toBe(18600);
  clock.sample(19000, 9000);
  expect(clock.now(9100)).toBe(19100);
});

test('the clock includes return latency and ignores duplicate receipt samples', () => {
  const clock = new ServerClock();
  clock.sample(10000, 650, 650);
  expect(clock.now(650)).toBe(10325);
  expect(clock.now(975)).toBe(10650);
  clock.sample(10000, 975, 2000);
  expect(clock.now(975)).toBe(10650);
  clock.sample(10650, 1300, 650);
  expect(clock.now(1300)).toBe(10975);
});
