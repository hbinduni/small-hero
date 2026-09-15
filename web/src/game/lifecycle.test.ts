import { afterEach, expect, mock, test } from 'bun:test';
import type { CommandInput } from '../lib/types';
import type { Intent } from './bridge';
import { ActionCooldown } from './cooldown';

mock.module('phaser', () => ({ default: { Scene: class {} } }));
const { VillageScene } = await import('./VillageScene');
const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.window = originalWindow;
});

type SceneHarness = {
  dispose(): void;
  syncState(): void;
  update(time: number, delta: number): void;
  keys: Set<string>;
  route: { x: number; y: number }[];
  flushMove(): Promise<boolean>;
  attack(target: { id: string }): Promise<void>;
  intent(intent: Intent): void;
  tickDragon(): Promise<void>;
  client: { send(input: CommandInput): Promise<boolean> };
};

function fixture() {
  const removed: string[] = [];
  globalThis.window = {
    removeEventListener: (event: string) => removed.push(event),
  } as unknown as Window & typeof globalThis;
  let unsubscribed = 0;
  const handler = (_intent: Intent) => {};
  const bridge: { handler: ((intent: Intent) => void) | null } = { handler };
  const scene = Object.assign(Object.create(VillageScene.prototype) as object, {
    disposed: false,
    unsubscribe: () => {
      unsubscribed++;
    },
    bridge,
    intentHandler: handler,
    keys: new Set(['w']),
    route: [{ x: 1, y: 1 }],
    pursuit: {},
    keydown: () => {},
    keyup: () => {},
    blur: () => {},
    attackCooldown: new ActionCooldown(680),
  }) as unknown as SceneHarness;
  return { scene, bridge, removed, unsubscribed: () => unsubscribed };
}

test('dispose detaches once and cannot clear a replacement scene handler', () => {
  const f = fixture();
  const replacement = (_intent: Intent) => {};
  f.bridge.handler = replacement;
  f.scene.dispose();
  f.scene.dispose();
  expect(f.unsubscribed()).toBe(1);
  expect(f.removed).toEqual(['keydown', 'keyup', 'blur']);
  expect(f.bridge.handler).toBe(replacement);
  expect(f.scene.keys.size).toBe(0);
  expect(f.scene.route).toEqual([]);
});

test('disposing during movement flush prevents a deferred attack', async () => {
  const f = fixture();
  let resolve!: (value: boolean) => void;
  const movement = new Promise<boolean>((done) => {
    resolve = done;
  });
  let commands = 0;
  f.scene.flushMove = () => movement;
  f.scene.client = {
    send: async () => {
      commands++;
      return false;
    },
  };
  const attack = f.scene.attack({ id: 'moss-1' });
  f.scene.dispose();
  resolve(true);
  await attack;
  expect(commands).toBe(0);
});

test('a disposed scene ignores updates and removes its own bridge handler', () => {
  const f = fixture();
  f.scene.dispose();
  expect(f.bridge.handler).toBeNull();
  expect(() => f.scene.syncState()).not.toThrow();
  expect(() => f.scene.update(1000, 16)).not.toThrow();
});

test('healing and equipping wait for a dodge position to save before resolving fire', async () => {
  for (const intent of [
    { type: 'heal' },
    { type: 'equip', id: 'iron_sword' },
  ] satisfies Intent[]) {
    const f = fixture();
    let resolve!: (saved: boolean) => void;
    const movement = new Promise<boolean>((done) => {
      resolve = done;
    });
    let flushes = 0;
    const commands: CommandInput[] = [];
    f.scene.flushMove = () => {
      flushes++;
      return movement;
    };
    f.scene.client = {
      send: async (input) => {
        commands.push(input);
        return true;
      },
    };
    f.scene.intent(intent);
    expect(flushes).toBe(1);
    expect(commands).toEqual([]);
    resolve(true);
    await Promise.resolve();
    expect(commands[0]?.type).toBe(intent.type);
  }
});

test('leaving the scene during tick movement prevents an orphaned encounter command', async () => {
  const f = fixture();
  let resolve!: (saved: boolean) => void;
  const movement = new Promise<boolean>((done) => {
    resolve = done;
  });
  const commands: CommandInput[] = [];
  f.scene.flushMove = () => movement;
  f.scene.client = {
    send: async (input) => {
      commands.push(input);
      return true;
    },
  };
  const tick = f.scene.tickDragon();
  f.scene.dispose();
  resolve(true);
  await tick;
  expect(commands).toEqual([]);
});
