export type Point = { x: number; y: number };
export type Item = {
  id: string;
  name: string;
  kind: 'weapon' | 'material' | 'consumable';
  rarity: 'common' | 'uncommon' | 'rare';
  description: string;
  attack?: number;
  heal?: number;
};
export type Recipe = {
  id: string;
  result: string;
  cost: Record<string, number>;
  gold: number;
  requiredLevel: number;
};
export type Enemy = Point & {
  id: string;
  hp: number;
  maxHp: number;
  respawnAt: number;
  kind?: 'slime' | 'dragon';
  name?: string;
  nextBreathAt?: number;
  breath?: {
    origin: Point;
    aim: Point;
    startsAt: number;
    endsAt: number;
    hit: boolean;
  };
};
export type ResourceNode = Point & { id: string; readyAt: number };
export type GameState = {
  version: number;
  name: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gold: number;
  inventory: Record<string, number>;
  equipped: string;
  position: Point;
  kills: number;
  crafted: number;
  questClaimed: boolean;
  enemies: Enemy[];
  nodes: ResourceNode[];
  lastActionAt: number;
};
export type Catalog = {
  items: Item[];
  recipes: Recipe[];
  world: {
    width: number;
    height: number;
    speed: number;
    polygon: Point[];
    spawn: Point;
    smithy: Point;
  };
};
export type GameResponse = {
  state: GameState;
  catalog: Catalog;
  message: string;
  event?: string;
  serverTime?: number;
};
export type CommandType =
  | 'tick'
  | 'move'
  | 'gather'
  | 'attack'
  | 'heavy_attack'
  | 'craft'
  | 'equip'
  | 'heal'
  | 'rest'
  | 'claim';
export type CommandInput = {
  type: CommandType;
  target?: string;
  x?: number;
  y?: number;
};
export type Command = CommandInput & { id: string; version: number };
export type WorldTarget = Point & {
  id: string;
  kind: 'enemy' | 'resource' | 'smithy' | 'camp';
  label: string;
  hitRadius?: number;
};
