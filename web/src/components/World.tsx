import { useEffect, useRef, useState } from 'react';
import type { GameBridge } from '../game/bridge';
import type { GameClient } from '../lib/client';

export function World({
  client,
  bridge,
  onSmithy,
}: {
  client: GameClient;
  bridge: GameBridge;
  onSmithy: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia('(max-width: 760px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const change = () => setCompact(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const callback = useRef(onSmithy);
  callback.current = onSmithy;
  useEffect(() => {
    let cancelled = false;
    let game: import('phaser').Game | undefined;
    let scene: import('../game/VillageScene').VillageScene | undefined;
    Promise.all([import('phaser'), import('../game/VillageScene')]).then(
      ([{ default: Phaser }, { VillageScene }]) => {
        if (cancelled || !container.current) return;
        scene = new VillageScene(client, bridge, () => callback.current());
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: container.current,
          width: compact ? 900 : 1536,
          height: compact ? 900 : 1024,
          backgroundColor: '#263b25',
          pixelArt: true,
          antialias: false,
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          scene,
          audio: { noAudio: true },
          banner: false,
        });
      },
    );
    return () => {
      cancelled = true;
      scene?.dispose();
      game?.destroy(true);
    };
  }, [client, bridge, compact]);
  return <div ref={container} className="game-canvas" />;
}
