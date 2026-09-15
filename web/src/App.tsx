import {
  Anvil,
  ArrowUpRight,
  Backpack as Bag,
  Check,
  CircleHelp,
  Compass,
  Flame,
  Leaf,
  LoaderCircle,
  Map as MapIcon,
  Maximize2,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Backpack, Quest } from './components/Backpack';
import { BossEncounter } from './components/BossEncounter';
import { Controls, Hud } from './components/Hud';
import { ItemIcon } from './components/ItemIcon';
import { Smithy } from './components/Smithy';
import { World } from './components/World';
import { GameBridge } from './game/bridge';
import { GameClient } from './lib/client';
import { GameSound } from './lib/sound';

export default function App() {
  const [client] = useState(() => new GameClient());
  const [bridge] = useState(() => new GameBridge());
  const [sound] = useState(() => new GameSound());
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [tab, setTab] = useState('inventory');
  const [page, setPage] = useState(() =>
    window.location.hash === '#journal' ? 'journal' : 'adventure',
  );
  const [mobilePanel, setMobilePanel] = useState('backpack');
  const [modal, setModal] = useState<'help' | 'map' | null>(null);
  const [audio, setAudio] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastSound = useRef(0);
  const { data, connection, pending, error, log } = snapshot;
  const mapPosition =
    page === 'journal' && data ? data.state.position : bridge.position;
  useEffect(() => {
    void client.start();
  }, [client]);
  useEffect(() => {
    const navigate = () => {
      setPage(window.location.hash === '#journal' ? 'journal' : 'adventure');
      setModal(null);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    document.title = `Small Hero · ${page === 'journal' ? 'Quest journal' : 'The Elderwood forge'}`;
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [page]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    const newest = log[0];
    if (newest && newest.id !== lastSound.current) {
      sound.play(newest.event);
      lastSound.current = newest.id;
    }
  }, [log, sound]);
  const openSmithy = () => {
    setMobilePanel('smithy');
  };
  const fullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Small Hero home">
          <span className="brand-emblem">
            <Swords size={25} />
          </span>
          <span>
            Small Hero<small>A little courage goes a long way</small>
          </span>
        </a>
        <nav aria-label="Game navigation">
          <a
            href="#adventure"
            className={
              page === 'adventure' && modal !== 'map' ? 'nav-active' : ''
            }
            aria-current={
              page === 'adventure' && modal !== 'map' ? 'page' : undefined
            }
          >
            <Compass size={16} />
            Adventure
          </a>
          <a
            href="#journal"
            className={
              page === 'journal' && modal !== 'map' ? 'nav-active' : ''
            }
            aria-current={
              page === 'journal' && modal !== 'map' ? 'page' : undefined
            }
          >
            <ScrollText size={16} />
            Quest journal
          </a>
          <button
            type="button"
            className={modal === 'map' ? 'nav-active' : ''}
            aria-pressed={modal === 'map'}
            onClick={() => setModal('map')}
          >
            <MapIcon size={16} />
            World map
          </button>
        </nav>
        <div className="topbar-actions">
          <span className="alpha-label">Chapter I</span>
          <button
            type="button"
            className="icon-button"
            title={audio ? 'Mute sound' : 'Enable sound'}
            aria-label={audio ? 'Mute sound' : 'Enable sound'}
            onClick={() => void sound.toggle().then(setAudio)}
          >
            {audio ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            type="button"
            className="icon-button"
            title="How to play"
            aria-label="How to play"
            onClick={() => setModal('help')}
          >
            <CircleHelp size={18} />
          </button>
        </div>
      </header>
      <main>
        <section className="adventure-heading">
          <div>
            <span className="chapter-symbol">
              <Leaf size={17} />
            </span>
            <div>
              <h1 ref={heading} tabIndex={-1}>
                {page === 'journal' ? 'Quest journal' : 'The Elderwood forge'}
              </h1>
              <p>
                {page === 'journal'
                  ? 'Your deeds, your promises, your next adventure.'
                  : 'Every great adventure starts somewhere.'}
              </p>
            </div>
          </div>
          <div className="world-status">
            <span className="sun-icon">☀</span>
            <span>
              Elderwood<small>A quiet afternoon</small>
            </span>
            <span className="status-divider" />
            <span className={`save-status ${connection}`}>
              <i />
              {connection === 'online'
                ? pending
                  ? 'Saving…'
                  : 'Progress saved'
                : connection === 'loading'
                  ? 'Connecting…'
                  : 'Offline'}
            </span>
          </div>
        </section>
        {page === 'journal' ? (
          <section className="journal-page" aria-label="Quest journal">
            <div className="journal-page-header">
              <span>
                <ScrollText size={18} /> Chapter I · Elderwood
              </span>
              <a href="#adventure">
                <Compass size={15} /> Return to adventure
              </a>
            </div>
            {data ? (
              <div className="journal-page-body">
                <div className="journal-illustration">
                  <img
                    src="/art/elderwood.png"
                    alt="Bram’s woodland forge in Elderwood"
                  />
                  <span>
                    Every blade has a story.
                    <br />
                    This one is yours.
                  </span>
                </div>
                <Quest
                  data={data}
                  client={client}
                  bridge={bridge}
                  busy={pending > 0 || connection !== 'online'}
                  showTravelActions={false}
                />
              </div>
            ) : (
              <p className="journal-loading">
                {connection === 'loading'
                  ? 'Opening your journal…'
                  : 'Your journal is waiting for a connection.'}
              </p>
            )}
            {error && <p className="game-error">{error}</p>}
            {connection === 'offline' && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void client.reconnect()}
              >
                Reconnect
              </button>
            )}
          </section>
        ) : (
          <div className={`game-layout mobile-${mobilePanel}`}>
            {data && (
              <Smithy
                data={data}
                client={client}
                bridge={bridge}
                pending={pending}
                connection={connection}
              />
            )}
            <section className="world-column" aria-label="Adventure">
              <div className="world-frame">
                <div className="location-tag">
                  <Compass size={17} />
                  <span>
                    Elderwood village<small>The heart of the forest</small>
                  </span>
                </div>
                <button
                  type="button"
                  className="minimap"
                  aria-label="Open world map"
                  onClick={() => setModal('map')}
                >
                  <span className="minimap-compass">N</span>
                  <span className="minimap-hero" />
                  <MapIcon size={13} />
                </button>
                {data ? (
                  <World
                    client={client}
                    bridge={bridge}
                    onSmithy={openSmithy}
                  />
                ) : (
                  <div className="loading-world">
                    <img
                      src="/art/elderwood.png"
                      alt="A woodland village with a blacksmith forge and a river"
                    />
                    <div className="loading-message">
                      <ItemIcon id="hero" />
                      {connection === 'loading' ? (
                        <>
                          <LoaderCircle className="spin" size={23} />
                          <h2>Finding your way to Elderwood…</h2>
                        </>
                      ) : (
                        <>
                          <h2>The village is out of reach</h2>
                          <p>Start the API and PostgreSQL, then reconnect.</p>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void client.reconnect()}
                          >
                            Reconnect
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <div className="world-caption">
                  <span>
                    <i /> Village clearing
                  </span>
                  <button
                    type="button"
                    aria-label="Toggle fullscreen"
                    title="Fullscreen"
                    onClick={() =>
                      void fullscreen().catch(() =>
                        client.notice(
                          'Fullscreen is not available in this browser.',
                        ),
                      )
                    }
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>
              </div>
              {data && (
                <Hud
                  state={data.state}
                  bridge={bridge}
                  busy={pending > 0 || connection !== 'online'}
                />
              )}
              {data && (
                <BossEncounter data={data} client={client} bridge={bridge} />
              )}
              <Controls />
              <div className="adventure-feed" aria-live="polite">
                {error ? (
                  <div className="game-error">
                    <span>{error}</span>
                    {connection === 'offline' && (
                      <button
                        type="button"
                        onClick={() => void client.reconnect()}
                      >
                        Reconnect
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <span className="feed-icon">
                      {log[0]?.event === 'craft' ? (
                        <Anvil size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                    </span>
                    <p>
                      {log[0]?.message ??
                        'Welcome to Elderwood. Visit Bram, gather iron, and forge your first legend.'}
                    </p>
                    <span className="feed-dot" />
                  </>
                )}
              </div>
              <div className="journey-note">
                <div className="journey-icon">
                  <Flame size={21} />
                </div>
                <div>
                  <h2>
                    {data?.state.questClaimed
                      ? 'Your first legend is forged'
                      : 'A blade of your own'}
                  </h2>
                  <p>
                    {data?.state.questClaimed
                      ? 'The road is still yours. Explore, gather, and grow stronger.'
                      : 'Defeat moss slimes. Gather living embers. Forge something extraordinary.'}
                  </p>
                </div>
                <a href="#journal" aria-label="Open quest details">
                  <ArrowUpRight size={18} />
                </a>
              </div>
            </section>
            {data && (
              <Backpack
                data={data}
                client={client}
                bridge={bridge}
                busy={pending > 0 || connection !== 'online'}
                tab={tab}
                setTab={setTab}
              />
            )}
            <div className="mobile-panel-tabs">
              <button
                type="button"
                className={mobilePanel === 'smithy' ? 'active' : ''}
                onClick={() => setMobilePanel('smithy')}
              >
                <Anvil size={17} /> Smithy
              </button>
              <button
                type="button"
                className={mobilePanel === 'backpack' ? 'active' : ''}
                onClick={() => setMobilePanel('backpack')}
              >
                <Bag size={17} /> Backpack & journal
              </button>
            </div>
          </div>
        )}
        <footer>
          <span>
            <ShieldCheck size={13} /> Single-player adventure
          </span>
          <span>Small steps. Great stories.</span>
          <span>
            <Check size={12} />{' '}
            {connection === 'online'
              ? 'Connected to Elderwood'
              : 'Waiting for connection'}
          </span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        className={`game-dialog ${modal === 'map' ? 'map-dialog' : ''}`}
        onCancel={() => setModal(null)}
      >
        <button
          type="button"
          className="dialog-close icon-button"
          aria-label="Close dialog"
          onClick={() => setModal(null)}
        >
          <X size={20} />
        </button>
        {modal === 'map' ? (
          <>
            <h2>The Elderwood clearing</h2>
            <p>A little corner of a much bigger world.</p>
            <div className="large-map">
              <img
                src="/art/elderwood.png"
                alt="Elderwood map. Bram's forge is northwest; timber and iron are east; the camp is in the central clearing."
              />
              <span
                className="map-pin-player"
                style={{
                  left: `${(mapPosition.x / 1536) * 100}%`,
                  top: `${(mapPosition.y / 1024) * 100}%`,
                }}
              >
                You
              </span>
              <span className="map-label-smith">Bram’s forge</span>
              <span className="map-label-forest">Mosswood trail</span>
              <span className="map-label-dragon">Cinderwing’s lair</span>
            </div>
            <div className="map-legend">
              <i /> Your hero{' '}
              <span>Explore by clicking the ground in the village.</span>
            </div>
          </>
        ) : (
          <>
            <span className="dialog-emblem">
              <Swords size={30} />
            </span>
            <h2>Your adventure begins here</h2>
            <p>You’re small. Your story doesn’t have to be.</p>
            <ol className="how-to">
              <li>
                <strong>Explore the clearing</strong>
                <span>
                  Use WASD, arrow keys, or click the ground. Click a resource or
                  character to approach and interact.
                </span>
              </li>
              <li>
                <strong>Gather & battle</strong>
                <span>
                  Click timber and iron nodes to gather. Click a moss slime to
                  approach and keep attacking. Moving cancels attacks. Space
                  strikes once; 2 uses 15 mana for a heavy strike.
                </span>
              </li>
              <li>
                <strong>Forge your first legend</strong>
                <span>
                  Make an iron sword at Bram’s forge, then combine it with iron
                  and ember shards for a flame blade. Equip it from your
                  backpack.
                </span>
              </li>
              <li>
                <strong>Challenge Cinderwing</strong>
                <span>
                  The dragon lives on the northeast trail. An orange cone warns
                  you where its fire breath will land. Move out before it fires,
                  then attack while it recovers. Defeat it for 100 gold, 120 XP,
                  and 3 embers.
                </span>
              </li>
              <li>
                <strong>Rest & return</strong>
                <span>
                  Press 1 to drink a healing potion. Return to camp for free
                  health and mana. Defeat costs 10% gold; you keep your items.
                  Your progress saves after every action in this browser.
                </span>
              </li>
            </ol>
            <button
              type="button"
              className="forge-button"
              onClick={() => setModal(null)}
            >
              Into the woods <Compass size={17} />
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
