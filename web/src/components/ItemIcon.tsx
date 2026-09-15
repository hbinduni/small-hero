import { Flame } from 'lucide-react';

const frames: Record<string, number> = {
  hero: 0,
  smith: 1,
  slime: 2,
  iron: 3,
  wood: 4,
  rusty_sword: 5,
  iron_sword: 5,
  flame_blade: 6,
  potion: 7,
};

export function ItemIcon({
  id,
  className = '',
}: {
  id: string;
  className?: string;
}) {
  if (id === 'ember')
    return (
      <span className={`item-art ember-art ${className}`} aria-hidden="true">
        <Flame fill="currentColor" />
      </span>
    );
  const frame = frames[id] ?? 0;
  return (
    <span
      aria-hidden="true"
      className={`item-art ${id === 'rusty_sword' ? 'rusty' : ''} ${className}`}
      style={{
        backgroundPosition: `${((frame % 4) * 100) / 3}% ${Math.floor(frame / 4) * 100}%`,
      }}
    />
  );
}
