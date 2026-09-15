import { Flame, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GameBridge } from '../game/bridge';
import { breathPhase, DRAGON_ID } from '../game/dragon';
import { distance } from '../game/navigation';
import type { GameClient } from '../lib/client';
import type { GameResponse } from '../lib/types';

export function BossEncounter({
  data,
  client,
  bridge,
}: {
  data: GameResponse;
  client: GameClient;
  bridge: GameBridge;
}) {
  const [now, setNow] = useState(client.serverNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(client.serverNow()), 100);
    return () => window.clearInterval(timer);
  }, [client]);
  const dragon = data.state.enemies.find((enemy) => enemy.id === DRAGON_ID);
  if (!dragon) return null;
  const near = distance(data.state.position, dragon) <= 300;
  const phase = breathPhase(dragon, now);
  const waiting = dragon.hp === 0 && dragon.respawnAt > now;
  const hint = waiting
    ? `Returns in ${Math.ceil((dragon.respawnAt - now) / 1000)}s`
    : near && phase === 'warning'
      ? 'Fire breath incoming · step out of the cone!'
      : near && phase === 'fire'
        ? 'Fire breath · keep clear!'
        : near && phase === 'recovering'
          ? 'Recovering · strike now'
          : near
            ? 'Dodge the orange cone. Moving cancels your attacks.'
            : 'A dragon guards the northeast trail. Watch for its fire breath.';
  return (
    <section
      className={`boss-encounter ${near ? 'engaged' : ''} ${phase}`}
      aria-label="Cinderwing miniboss"
    >
      <span className="dragon-portrait" aria-hidden="true" />
      <div className="boss-details">
        <div className="boss-title">
          <span>
            <Flame size={12} /> Miniboss
          </span>
          <strong>Cinderwing</strong>
          <span>
            {dragon.hp} / {dragon.maxHp} HP
          </span>
        </div>
        <div
          className="boss-health"
          role="progressbar"
          aria-label="Cinderwing health"
          aria-valuemin={0}
          aria-valuemax={dragon.maxHp}
          aria-valuenow={dragon.hp}
        >
          <i style={{ width: `${(dragon.hp / dragon.maxHp) * 100}%` }} />
        </div>
        <p aria-live="polite">{hint}</p>
        {!near && <small>Reward: 100 gold · 120 XP · 3 embers</small>}
      </div>
      <button
        type="button"
        className="boss-action"
        disabled={waiting || client.getSnapshot().connection !== 'online'}
        onClick={() => bridge.send({ type: 'target', id: DRAGON_ID })}
      >
        <Swords size={16} />
        {near ? 'Attack dragon' : 'Find Cinderwing'}
      </button>
    </section>
  );
}
