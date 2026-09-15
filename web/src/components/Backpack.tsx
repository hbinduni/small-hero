import {
  Backpack as Bag,
  Check,
  ChevronRight,
  Coins,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import type { GameBridge } from '../game/bridge';
import { distance } from '../game/navigation';
import type { GameClient } from '../lib/client';
import type { GameResponse } from '../lib/types';
import { ItemIcon } from './ItemIcon';

const inventorySlots = Array.from(
  { length: 20 },
  (_, index) => `slot-${index + 1}`,
);

export function Backpack({
  data,
  client,
  bridge,
  busy,
  tab,
  setTab,
}: {
  data: GameResponse;
  client: GameClient;
  bridge: GameBridge;
  busy: boolean;
  tab: string;
  setTab: (tab: string) => void;
}) {
  const [selected, setSelected] = useState('rusty_sword');
  const [filter, setFilter] = useState('all');
  const items = data.catalog.items.filter(
    (i) =>
      (data.state.inventory[i.id] ?? 0) > 0 &&
      (filter === 'all' || i.kind === filter),
  );
  const item =
    data.catalog.items.find(
      (i) => i.id === selected && (data.state.inventory[i.id] ?? 0) > 0,
    ) ?? items[0];
  const equipped = data.catalog.items.find((i) => i.id === data.state.equipped);
  return (
    <aside className="panel backpack-panel" aria-label="Hero and inventory">
      <div className="panel-heading">
        <Bag size={18} />
        <h2>Adventure pack</h2>
        <span className="capacity">
          {Object.values(data.state.inventory).filter((n) => n > 0).length}/20
        </span>
      </div>
      <div className="hero-card">
        <div className="portrait">
          <ItemIcon id="hero" />
          <span>{data.state.level}</span>
        </div>
        <div>
          <h3>{data.state.name}</h3>
          <p>Novice adventurer</p>
          <div className="xp-mini">
            <i
              style={{
                width: `${(data.state.xp / data.state.nextLevelXp) * 100}%`,
              }}
            />
          </div>
          <small>
            {data.state.xp} / {data.state.nextLevelXp} XP
          </small>
        </div>
      </div>
      <div className="panel-tabs" role="tablist" aria-label="Hero panels">
        {[
          { id: 'inventory', icon: Bag, label: 'Backpack' },
          { id: 'hero', icon: UserRound, label: 'Hero' },
          { id: 'journal', icon: ScrollText, label: 'Journal' },
        ].map((t) => (
          <button
            type="button"
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'active' : ''}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'inventory' && (
        <>
          <div className="inventory-toolbar">
            <h3>Inventory</h3>
            <select
              aria-label="Filter inventory"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All items</option>
              <option value="weapon">Weapons</option>
              <option value="material">Materials</option>
              <option value="consumable">Potions</option>
            </select>
          </div>
          <div className="inventory-grid">
            {inventorySlots.map((slotId, index) => {
              const cell = items[index];
              return cell ? (
                <button
                  type="button"
                  key={cell.id}
                  className={`inventory-slot ${cell.rarity} ${item?.id === cell.id ? 'selected' : ''}`}
                  onClick={() => setSelected(cell.id)}
                  aria-label={`${cell.name}, quantity ${data.state.inventory[cell.id]}${data.state.equipped === cell.id ? ', equipped' : ''}`}
                  aria-pressed={item?.id === cell.id}
                >
                  <ItemIcon id={cell.id} />
                  <span className="item-count">
                    {data.state.inventory[cell.id]}
                  </span>
                  {data.state.equipped === cell.id && (
                    <Check className="equipped-check" size={13} />
                  )}
                </button>
              ) : (
                <div key={slotId} className="inventory-slot empty" />
              );
            })}
          </div>
          <div className="coin-pouch">
            <span>Coin pouch</span>
            <strong>
              <Coins size={17} />
              {data.state.gold.toLocaleString()}
              <small>gold</small>
            </strong>
          </div>
          {item ? (
            <div className={`item-details ${item.rarity}`}>
              <div className="item-detail-heading">
                <ItemIcon id={item.id} />
                <div>
                  <h3>{item.name}</h3>
                  <span>
                    {item.rarity} {item.kind}
                  </span>
                </div>
              </div>
              <p>{item.description}</p>
              {item.attack && (
                <div className="item-attribute">
                  <Swords size={13} />
                  {item.attack} attack
                </div>
              )}
              {item.kind === 'weapon' ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || data.state.equipped === item.id}
                  onClick={() => bridge.send({ type: 'equip', id: item.id })}
                >
                  {data.state.equipped === item.id ? (
                    <>
                      <Check size={14} /> Equipped
                    </>
                  ) : (
                    <>
                      <Swords size={14} /> Equip weapon
                    </>
                  )}
                </button>
              ) : item.kind === 'consumable' ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || data.state.hp === data.state.maxHp}
                  onClick={() => bridge.send({ type: 'heal' })}
                >
                  Drink potion · +45 HP
                </button>
              ) : (
                <span className="item-use">Crafting material</span>
              )}
            </div>
          ) : (
            <p className="empty-inventory">No items in this category yet.</p>
          )}
        </>
      )}
      {tab === 'hero' && (
        <div className="hero-stats-content">
          <h3>Ready for the road</h3>
          <p>Every encounter makes your little hero stronger.</p>
          <div className="stat-row">
            <Swords size={16} />
            <span>Attack</span>
            <strong>{equipped?.attack ?? 12}</strong>
          </div>
          <div className="stat-row">
            <Shield size={16} />
            <span>Max health</span>
            <strong>{data.state.maxHp}</strong>
          </div>
          <div className="stat-row">
            <Sparkles size={16} />
            <span>Max mana</span>
            <strong>{data.state.maxMana}</strong>
          </div>
          <div className="stat-row">
            <Swords size={16} />
            <span>Slimes defeated</span>
            <strong>{data.state.kills}</strong>
          </div>
          <div className="stat-row">
            <Check size={16} />
            <span>Weapons forged</span>
            <strong>{data.state.crafted}</strong>
          </div>
          <div className="equipped-weapon">
            <ItemIcon id={data.state.equipped} />
            <span>
              In your hand<strong>{equipped?.name}</strong>
            </span>
          </div>
          <p className="panel-hint">
            Gain XP from combat to level up and restore your health and mana.
          </p>
        </div>
      )}
      {tab === 'journal' && (
        <Quest data={data} client={client} bridge={bridge} busy={busy} />
      )}
      {tab !== 'journal' && (
        <button
          type="button"
          className="journal-shortcut"
          onClick={() => setTab('journal')}
        >
          <ScrollText size={17} />
          <span>
            <small>Current quest</small>
            <strong>
              {data.state.questClaimed
                ? 'A legend in the making'
                : 'A blade of your own'}
            </strong>
          </span>
          <ChevronRight size={16} />
        </button>
      )}
    </aside>
  );
}

export function Quest({
  data,
  client,
  bridge,
  busy,
  showTravelActions = true,
}: {
  data: GameResponse;
  client: GameClient;
  bridge: GameBridge;
  busy: boolean;
  showTravelActions?: boolean;
}) {
  const blade = (data.state.inventory.flame_blade ?? 0) > 0;
  const ready = blade && data.state.kills >= 3;
  return (
    <div className="quest-content">
      <span className="quest-chapter">Chapter I</span>
      <h3>A blade of your own</h3>
      <p>
        “Every hero needs a blade with a story. Bring me iron and a few living
        embers. We’ll make yours.”
      </p>
      <span className="quest-author">Bram, village blacksmith</span>
      <ul className="quest-objectives">
        <li className={data.state.kills >= 3 ? 'done' : ''}>
          <span className="objective-box">
            {data.state.kills >= 3 && <Check size={12} />}
          </span>
          <span>Defeat moss slimes</span>
          <strong>{Math.min(data.state.kills, 3)}/3</strong>
        </li>
        <li className={blade ? 'done' : ''}>
          <span className="objective-box">{blade && <Check size={12} />}</span>
          <span>Forge a flame blade</span>
          <strong>{blade ? 1 : 0}/1</strong>
        </li>
      </ul>
      <div className="quest-reward">
        <Coins size={18} />
        <span>
          Quest reward<strong>100 gold</strong>
        </span>
      </div>
      {data.state.questClaimed ? (
        <div className="quest-complete">
          <Check size={18} /> Quest completed
        </div>
      ) : ready ? (
        <>
          <button
            type="button"
            className="forge-button"
            disabled={
              busy ||
              distance(
                showTravelActions ? bridge.position : data.state.position,
                data.catalog.world.smithy,
              ) > 100
            }
            onClick={() => void client.send({ type: 'claim' })}
          >
            Claim reward at the forge
          </button>
          {showTravelActions && (
            <button
              type="button"
              className="text-button"
              onClick={() => bridge.send({ type: 'target', id: 'smithy' })}
            >
              Walk to Bram
            </button>
          )}
        </>
      ) : showTravelActions ? (
        <button
          type="button"
          className="secondary-button"
          onClick={() => bridge.send({ type: 'target', id: 'moss-1' })}
        >
          Find moss slimes <ChevronRight size={14} />
        </button>
      ) : null}
      <div className="quest-tip">
        <Sparkles size={14} />
        <p>
          Forge an iron sword first. It becomes the heart of your flame blade.
        </p>
      </div>
    </div>
  );
}
