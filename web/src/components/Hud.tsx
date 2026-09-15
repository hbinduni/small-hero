import {
  Droplet,
  Flame,
  Heart,
  Home,
  MousePointer2,
  Swords,
} from 'lucide-react';
import type { GameBridge } from '../game/bridge';
import type { GameState } from '../lib/types';
import { ItemIcon } from './ItemIcon';

export function Hud({
  state,
  bridge,
  busy,
}: {
  state: GameState;
  bridge: GameBridge;
  busy: boolean;
}) {
  return (
    <div className="hud">
      <div className="hud-portrait">
        <ItemIcon id="hero" />
        <span>Lv. {state.level}</span>
      </div>
      <div className="vitals">
        <div className="vital-row">
          <Heart size={13} fill="currentColor" />
          <div className="vital-track health">
            <i style={{ width: `${(state.hp / state.maxHp) * 100}%` }} />
            <span>
              {state.hp} / {state.maxHp}
            </span>
          </div>
        </div>
        <div className="vital-row">
          <Droplet size={13} fill="currentColor" />
          <div className="vital-track mana">
            <i style={{ width: `${(state.mana / state.maxMana) * 100}%` }} />
            <span>
              {state.mana} / {state.maxMana}
            </span>
          </div>
        </div>
        <div className="xp-track">
          <i style={{ width: `${(state.xp / state.nextLevelXp) * 100}%` }} />
        </div>
      </div>
      <div className="quickbar">
        <button
          type="button"
          title="Attack the nearest enemy (Space)"
          aria-label="Attack nearest enemy"
          onClick={() => bridge.send({ type: 'attack' })}
          disabled={busy}
        >
          <ItemIcon id={state.equipped} />
          <kbd>Space</kbd>
        </button>
        <button
          type="button"
          title="Heavy strike: 15 mana (2)"
          aria-label="Heavy strike"
          onClick={() => bridge.send({ type: 'heavy_attack' })}
          disabled={busy || state.mana < 15}
        >
          <Flame className="skill-flame" size={27} />
          <kbd>2</kbd>
        </button>
        <button
          type="button"
          title="Healing potion: restore 45 HP (1)"
          aria-label="Drink healing potion"
          onClick={() => bridge.send({ type: 'heal' })}
          disabled={busy || state.hp === state.maxHp || !state.inventory.potion}
        >
          <ItemIcon id="potion" />
          <span className="quick-count">{state.inventory.potion ?? 0}</span>
          <kbd>1</kbd>
        </button>
        <button
          type="button"
          title="Walk to camp and restore health and mana"
          aria-label="Return to camp and rest"
          onClick={() => bridge.send({ type: 'rest' })}
        >
          <Home size={24} />
          <span className="quick-label">Rest</span>
        </button>
      </div>
    </div>
  );
}

export function Controls() {
  return (
    <div className="controls-strip">
      <span>
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> Move
      </span>
      <span>
        <MousePointer2 size={12} /> Click to explore
      </span>
      <span>
        <kbd>E</kbd> Interact
      </span>
      <span>
        <Swords size={12} />
        <kbd>Space</kbd> Attack
      </span>
    </div>
  );
}
