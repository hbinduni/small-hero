import { afterEach, expect, spyOn, test } from 'bun:test';
import { GameClient } from './client';
import type { GameResponse } from './types';

const originalFetch = globalThis.fetch;
let restoreClock = () => {};
afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreClock();
  restoreClock = () => {};
});
function fakeClock() {
  const time = { now: 0 };
  const clock = spyOn(performance, 'now').mockImplementation(() => time.now);
  restoreClock = () => clock.mockRestore();
  return time;
}
function response(version: number): GameResponse {
  return {
    state: {
      version,
      name: 'Hero',
      level: 1,
      xp: 0,
      nextLevelXp: 100,
      hp: 100,
      maxHp: 100,
      mana: 60,
      maxMana: 60,
      gold: 80,
      inventory: {},
      equipped: 'rusty_sword',
      position: { x: 760 + version, y: 540 },
      kills: 0,
      crafted: 0,
      questClaimed: false,
      enemies: [],
      nodes: [],
      lastActionAt: 0,
    },
    catalog: {
      items: [],
      recipes: [],
      world: {
        width: 1536,
        height: 1024,
        speed: 220,
        polygon: [],
        spawn: { x: 760, y: 540 },
        smithy: { x: 600, y: 370 },
      },
    },
    message: 'Saved',
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  globalThis.fetch = handler as typeof fetch;
}

test('refresh after conflict discards movement queued before the refresh', async () => {
  let commands = 0;
  mockFetch(async (url) => {
    if (url.endsWith('session')) return Response.json(response(0));
    if (url.endsWith('game')) return Response.json(response(8));
    commands++;
    return commands === 1
      ? Response.json({ error: 'Conflict' }, { status: 409 })
      : Response.json(response(9));
  });
  const client = new GameClient();
  await client.start();
  const first = client.send({ type: 'move', x: 800, y: 540 });
  const second = client.send({ type: 'move', x: 830, y: 540 });
  expect(await first).toBe(false);
  expect(await second).toBe(false);
  expect(commands).toBe(1);
  expect(client.getSnapshot().data?.state.version).toBe(8);
  expect(client.getSnapshot().pending).toBe(0);
});

test('a stale in-flight command cannot overwrite a completed reconnect', async () => {
  const flight = deferred<Response>();
  const entered = deferred<boolean>();
  let sessions = 0;
  mockFetch(async (url) => {
    if (url.endsWith('session'))
      return Response.json(response(sessions++ ? 7 : 0));
    entered.resolve(true);
    return flight.promise;
  });
  const client = new GameClient();
  await client.start();
  const command = client.send({ type: 'move', x: 800, y: 540 });
  await entered.promise;
  await client.reconnect();
  flight.resolve(Response.json(response(1)));
  expect(await command).toBe(false);
  expect(client.getSnapshot().data?.state.version).toBe(7);
});

test('a lost response retries exactly the same receipt key and version', async () => {
  const bodies: unknown[] = [];
  mockFetch(async (url, init) => {
    if (url.endsWith('session')) return Response.json(response(0));
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1) throw new TypeError('Response lost');
    return Response.json(response(1));
  });
  const client = new GameClient();
  await client.start();
  expect(await client.send({ type: 'heal' })).toBe(true);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
  expect(client.getSnapshot().data?.state.version).toBe(1);
});

test('reconnect publishes a restore revision even when a new session has version zero', async () => {
  mockFetch(async () => Response.json(response(0)));
  const client = new GameClient();
  await client.start();
  const revision = client.getSnapshot().restoreRevision;
  await client.reconnect();
  expect(client.getSnapshot().restoreRevision).toBe(revision + 1);
  expect(client.getSnapshot().data?.state.position).toEqual({ x: 760, y: 540 });
});

test('inputs arriving during authoritative refresh are discarded', async () => {
  const refresh = deferred<Response>();
  const entered = deferred<boolean>();
  let commands = 0;
  mockFetch(async (url) => {
    if (url.endsWith('session')) return Response.json(response(0));
    if (url.endsWith('game')) {
      entered.resolve(true);
      return refresh.promise;
    }
    commands++;
    return commands === 1
      ? Response.json({ error: 'Conflict' }, { status: 409 })
      : Response.json(response(9));
  });
  const client = new GameClient();
  await client.start();
  const first = client.send({ type: 'move', x: 800, y: 540 });
  await entered.promise;
  const next = client.send({ type: 'move', x: 830, y: 540 });
  refresh.resolve(Response.json(response(8)));
  expect(await first).toBe(false);
  expect(await next).toBe(false);
  expect(commands).toBe(1);
  expect(client.getSnapshot().restoreRevision).toBe(2);
  expect(client.getSnapshot().connection).toBe('online');
});

test('quiet encounter ticks do not erase messages, but fire damage during movement is reported', async () => {
  let version = 0;
  mockFetch(async (url, init) => {
    if (url.endsWith('session')) return Response.json(response(0));
    const type = JSON.parse(String(init?.body)).type;
    return Response.json({
      ...response(++version),
      event: type === 'tick' ? 'tick' : 'fire_hit',
      message: type === 'tick' ? '' : 'Fire breath hits for 28 damage.',
    });
  });
  const client = new GameClient();
  await client.start();
  client.notice('Keep out of the cone.');
  await client.send({ type: 'tick' });
  expect(client.getSnapshot().log[0].message).toBe('Keep out of the cone.');
  await client.send({ type: 'move', x: 1300, y: 250 });
  expect(client.getSnapshot().log[0].event).toBe('fire_hit');
});

test('a 650ms response leaves the next encounter tick eligible immediately', async () => {
  const time = fakeClock();
  mockFetch(async (url) => {
    const session = url.endsWith('session');
    time.now += 650;
    return Response.json({
      ...response(session ? 0 : 1),
      serverTime: session ? 10000 : 10650,
    });
  });
  const client = new GameClient();
  await client.start();
  expect(client.sinceDispatch()).toBe(650);
  expect(client.serverNow()).toBe(10325);
  await client.send({ type: 'tick' });
  expect(client.getSnapshot().pending).toBe(0);
  expect(client.sinceDispatch()).toBeGreaterThanOrEqual(400);
  expect(client.sinceDispatch()).toBe(650);
  expect(client.serverNow()).toBe(10975);
});

test('queued commands measure cadence from their actual dispatch', async () => {
  const time = fakeClock();
  const flight = deferred<Response>();
  const firstEntered = deferred<boolean>();
  const secondEntered = deferred<boolean>();
  const secondFlight = deferred<Response>();
  let commands = 0;
  mockFetch(async (url) => {
    if (url.endsWith('session')) return Response.json(response(0));
    if (++commands === 1) {
      firstEntered.resolve(true);
      return flight.promise;
    }
    secondEntered.resolve(true);
    return secondFlight.promise;
  });
  const client = new GameClient();
  await client.start();
  time.now = 100;
  const first = client.send({ type: 'tick' });
  await firstEntered.promise;
  time.now = 200;
  const second = client.send({ type: 'heal' });
  expect(client.sinceDispatch()).toBe(100);
  time.now = 750;
  flight.resolve(Response.json(response(1)));
  await secondEntered.promise;
  expect(client.sinceDispatch()).toBe(0);
  time.now = 850;
  secondFlight.resolve(Response.json(response(2)));
  await Promise.all([first, second]);
  expect(client.sinceDispatch()).toBe(100);
});

test('a retried stored receipt cannot rewind the latency-adjusted clock', async () => {
  const time = fakeClock();
  let attempts = 0;
  mockFetch(async (url) => {
    if (url.endsWith('session'))
      return Response.json({ ...response(0), serverTime: 10000 });
    if (++attempts === 1) {
      time.now += 8000;
      throw new TypeError('Response lost');
    }
    time.now += 650;
    return Response.json({ ...response(1), serverTime: 10400 });
  });
  const client = new GameClient();
  await client.start();
  expect(await client.send({ type: 'tick' })).toBe(true);
  expect(client.serverNow()).toBe(18650);
  expect(client.sinceDispatch()).toBe(650);
});

test('a stale response cannot change the clock after reconnect', async () => {
  const time = fakeClock();
  const flight = deferred<Response>();
  const entered = deferred<boolean>();
  let sessions = 0;
  mockFetch(async (url) => {
    if (url.endsWith('session'))
      return Response.json({
        ...response(sessions),
        serverTime: sessions++ ? 10500 : 10000,
      });
    entered.resolve(true);
    return flight.promise;
  });
  const client = new GameClient();
  await client.start();
  const command = client.send({ type: 'tick' });
  await entered.promise;
  time.now = 500;
  await client.reconnect();
  time.now = 1000;
  flight.resolve(Response.json({ ...response(2), serverTime: 11000 }));
  expect(await command).toBe(false);
  expect(client.serverNow()).toBe(11000);
  expect(client.sinceDispatch()).toBe(500);
});
