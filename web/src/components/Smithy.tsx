import {
  Anvil,
  Check,
  ChevronRight,
  Coins,
  Flame,
  Hammer,
  MapPin,
  Sparkles,
  Swords,
} from 'lucide-react';
import { useState } from 'react';
import type { GameBridge } from '../game/bridge';
import { distance } from '../game/navigation';
import type { GameClient, Snapshot } from '../lib/client';
import { getForgeStatus } from '../lib/crafting';
import type { GameResponse } from '../lib/types';
import { ItemIcon } from './ItemIcon';

export function Smithy({
  data,
  client,
  bridge,
  pending,
  connection,
}: {
  data: GameResponse;
  client: GameClient;
  bridge: GameBridge;
  pending: number;
  connection: Snapshot['connection'];
}) {
  const [selected, setSelected] = useState('flame_blade');
  const recipe =
    data.catalog.recipes.find((r) => r.id === selected) ??
    data.catalog.recipes[0];
  const item = data.catalog.items.find((i) => i.id === recipe.result);
  if (!item) return null;
  const status = getForgeStatus(
    data.state,
    recipe,
    data.catalog.world.smithy,
    connection,
    pending,
  );
  const atSmithy =
    distance(data.state.position, data.catalog.world.smithy) <= 100;
  const missing = Object.entries(recipe.cost)
    .filter(([id, count]) => (data.state.inventory[id] ?? 0) < count)
    .map(
      ([id, count]) =>
        `${count - (data.state.inventory[id] ?? 0)} ${data.catalog.items.find((i) => i.id === id)?.name ?? id}`,
    );
  const hint = {
    offline: 'Connect to the village to use the forge.',
    working: 'Saving your last action. The forge will be ready shortly.',
    materials: `Still needed: ${missing.join(', ')}.`,
    gold: `Collect ${Math.max(0, recipe.gold - data.state.gold)} more gold to pay Bram.`,
    level: `Reach level ${recipe.requiredLevel} to forge this weapon.`,
    travel: 'All supplies are ready. Go to Bram, then forge your weapon.',
    ready: 'All requirements complete. Bram’s hammer is ready.',
  }[status];
  return (
    <aside className="panel smithy-panel" aria-label="Smithy">
      <div className="panel-heading">
        <Anvil size={19} />
        <h2>Smithy</h2>
        <span className="tiny-gem" />
      </div>
      <div className="smith-intro">
        <ItemIcon id="smith" />
        <div>
          <strong>Bram’s forge</strong>
          <span>Fine steel. A little magic.</span>
        </div>
      </div>
      <div className="section-line">
        <h3>Weapon recipes</h3>
        <span>2 blueprints</span>
      </div>
      <div className="recipe-list">
        {data.catalog.recipes.map((r) => {
          const weapon = data.catalog.items.find((i) => i.id === r.result);
          return (
            <button
              type="button"
              className={`recipe-option ${selected === r.id ? 'selected' : ''}`}
              key={r.id}
              onClick={() => setSelected(r.id)}
              aria-pressed={selected === r.id}
            >
              <ItemIcon id={r.result} />
              <span>
                <strong>{weapon?.name}</strong>
                <small>
                  {r.id === 'flame_blade'
                    ? 'Ember-forged weapon'
                    : 'A trusty first upgrade'}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          );
        })}
      </div>
      <div
        className={`weapon-showcase ${selected === 'flame_blade' ? 'flame' : ''}`}
      >
        <span className="showcase-orbit" />
        <ItemIcon id={item.id} />
        <span className="rarity-badge">
          {item.rarity === 'rare' ? (
            <Sparkles size={11} />
          ) : (
            <Swords size={11} />
          )}{' '}
          {item.rarity}
        </span>
      </div>
      <div className="weapon-title">
        <h3>{item.name}</h3>
        <p>
          {selected === 'flame_blade'
            ? 'Some legends begin with a spark.'
            : 'An honest blade for the road ahead.'}
        </p>
      </div>
      <div className="weapon-stats">
        <span>
          <Swords size={15} /> Attack
        </span>
        <strong>
          {item.attack}
          <small> +{(item.attack ?? 0) - 12}</small>
        </strong>
      </div>
      {selected === 'flame_blade' && (
        <div className="weapon-effect">
          <Flame size={15} />
          <span>
            Heavy strike deals <strong>76 damage</strong>
          </span>
        </div>
      )}
      <div className="section-line materials-heading">
        <h3>Materials needed</h3>
        <span>Owned / needed</span>
      </div>
      <div className="material-list">
        {Object.entries(recipe.cost).map(([id, count]) => {
          const owned = data.state.inventory[id] ?? 0;
          const name = data.catalog.items.find((i) => i.id === id)?.name ?? id;
          return (
            <div
              className={`material ${owned >= count ? 'enough' : ''}`}
              key={id}
            >
              <ItemIcon id={id} />
              <span>{name}</span>
              <strong>
                {owned}
                <small> / {count}</small>
              </strong>
              <RequirementStatus
                complete={owned >= count}
                label={`${name}: ${owned >= count ? 'complete' : `need ${count - owned} more`}`}
              />
            </div>
          );
        })}
      </div>
      <div className="forge-cost">
        <span>Forging cost</span>
        <strong>
          <Coins size={14} />
          {data.state.gold} / {recipe.gold} gold
        </strong>
        <RequirementStatus
          complete={data.state.gold >= recipe.gold}
          label={`Gold: ${data.state.gold >= recipe.gold ? 'complete' : `need ${recipe.gold - data.state.gold} more`}`}
        />
      </div>
      <button
        type="button"
        className="forge-button"
        disabled={status !== 'ready' && status !== 'travel'}
        aria-describedby="forge-hint"
        onClick={() => {
          if (status === 'travel')
            bridge.send({ type: 'target', id: 'smithy' });
          else if (status === 'ready')
            void client.send({ type: 'craft', target: recipe.id });
        }}
      >
        {status === 'travel' ? <MapPin size={17} /> : <Hammer size={17} />}
        {status === 'working'
          ? 'Working…'
          : status === 'travel'
            ? 'Go to Bram’s forge'
            : `Forge ${item.name.toLowerCase()}`}
      </button>
      <p id="forge-hint" className="panel-hint" aria-live="polite">
        {hint}
      </p>
      {!atSmithy && status !== 'travel' && connection === 'online' && (
        <button
          type="button"
          className="text-button"
          onClick={() => bridge.send({ type: 'target', id: 'smithy' })}
        >
          <MapPin size={12} /> Walk to Bram’s forge
        </button>
      )}
    </aside>
  );
}

function RequirementStatus({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <span
      className={`requirement-status ${complete ? 'complete' : 'missing'}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {complete ? <Check size={13} /> : <span aria-hidden="true">·</span>}
    </span>
  );
}
