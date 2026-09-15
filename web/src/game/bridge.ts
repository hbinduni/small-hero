import type { Point, WorldTarget } from '../lib/types';

export type Intent =
  | { type: 'target'; id: string }
  | { type: 'equip'; id: string }
  | { type: 'attack' | 'heavy_attack' | 'heal' | 'rest' | 'interact' };
export class GameBridge {
  position: Point = { x: 760, y: 540 };
  target: WorldTarget | null = null;
  handler: ((intent: Intent) => void) | null = null;
  send(intent: Intent) {
    this.handler?.(intent);
  }
}
