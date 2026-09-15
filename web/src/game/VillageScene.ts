import Phaser from 'phaser';
import type { GameClient } from '../lib/client';
import type {
  CommandInput,
  Enemy,
  GameResponse,
  Point,
  WorldTarget,
} from '../lib/types';
import type { GameBridge, Intent } from './bridge';
import { ActionCooldown } from './cooldown';
import {
  BREATH_HALF_ANGLE,
  BREATH_RANGE,
  breathCone,
  breathPhase,
  DRAGON_ID,
  needsDragonTick,
} from './dragon';
import { distance, findPath, inside, segmentInside } from './navigation';
import { pointerTarget } from './targets';

type Actor = {
  target: WorldTarget;
  sprite: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  bar?: Phaser.GameObjects.Graphics;
};

export class VillageScene extends Phaser.Scene {
  private disposed = false;
  private intentHandler = (intent: Intent) => this.intent(intent);
  private response: GameResponse;
  private hero!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private marker!: Phaser.GameObjects.Ellipse;
  private actors: Actor[] = [];
  private route: Point[] = [];
  private keys = new Set<string>();
  private pursuit: WorldTarget | null = null;
  private moving = false;
  private lastSync = 0;
  private attackCooldown = new ActionCooldown(680);
  private unsubscribe?: () => void;
  private wasError: string | null = null;
  private restoreRevision = 0;
  private breathGround!: Phaser.GameObjects.Graphics;
  private breathFlames!: Phaser.GameObjects.Graphics;
  private lastTickAt = 0;
  private ticking = false;
  private lastBreath = 0;
  private motion = !window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;

  constructor(
    private client: GameClient,
    private bridge: GameBridge,
    private onSmithy: () => void,
  ) {
    super('Elderwood');
    const data = client.getSnapshot().data;
    if (!data)
      throw new Error('A hero must be loaded before opening the village.');
    this.response = data;
    this.restoreRevision = client.getSnapshot().restoreRevision;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.blur);
    if (this.bridge.handler === this.intentHandler) this.bridge.handler = null;
    this.keys.clear();
    this.route = [];
    this.pursuit = null;
  }

  preload() {
    if (this.disposed) return;
    this.load.image('elderwood', '/art/elderwood.png');
    this.load.spritesheet('sprites', '/art/sprites.png', {
      frameWidth: 384,
      frameHeight: 512,
    });
    this.load.spritesheet('cinderwing', '/art/cinderwing.png', {
      frameWidth: 627,
      frameHeight: 627,
    });
  }

  create() {
    if (this.disposed) return;
    this.events.once('shutdown', () => this.dispose());
    this.events.once('destroy', () => this.dispose());
    this.add.image(0, 0, 'elderwood').setOrigin(0);
    this.breathGround = this.add.graphics().setDepth(1);
    this.breathFlames = this.add.graphics().setDepth(125);
    this.cameras.main.setBounds(0, 0, 1536, 1024);
    const state = this.response.state;
    this.bridge.position = { ...state.position };
    this.marker = this.add
      .ellipse(0, 0, 35, 16)
      .setStrokeStyle(2, 0xf4d78d)
      .setVisible(false)
      .setDepth(2);
    this.shadow = this.add
      .ellipse(state.position.x, state.position.y, 50, 18, 0x0c180e, 0.4)
      .setDepth(3);
    this.hero = this.add
      .image(state.position.x, state.position.y - 42, 'sprites', 0)
      .setDisplaySize(104, 139)
      .setDepth(100);
    if (this.scale.width < 1536)
      this.cameras.main.startFollow(this.hero, true, 0.12, 0.12);
    this.addActor(
      {
        ...this.response.catalog.world.smithy,
        id: 'smithy',
        kind: 'smithy',
        label: 'Bram the smith',
      },
      1,
      100,
    );
    this.addActor(
      {
        ...this.response.catalog.world.spawn,
        id: 'camp',
        kind: 'camp',
        label: 'Rest at camp',
      },
      -1,
      65,
    );
    for (const node of state.nodes)
      this.addActor(
        {
          ...node,
          kind: 'resource',
          label: node.id === 'wood' ? 'Gather timber' : 'Mine iron',
        },
        node.id === 'wood' ? 4 : 3,
        94,
      );
    for (const enemy of state.enemies) this.addEnemy(enemy);
    if (this.motion) {
      for (let i = 0; i < 16; i++) {
        const mote = this.add
          .circle(
            480 + Math.random() * 850,
            300 + Math.random() * 370,
            1.5,
            0xffe4a3,
            0.55,
          )
          .setDepth(5);
        this.tweens.add({
          targets: mote,
          y: mote.y - 45,
          alpha: 0,
          duration: 2200 + Math.random() * 3000,
          delay: Math.random() * 2000,
          repeat: -1,
          yoyo: true,
        });
      }
    }
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.disposed) return;
      this.game.canvas.focus();
      const point = { x: pointer.worldX, y: pointer.worldY };
      const target = pointerTarget(
        point,
        this.actors.map((actor) => actor.target),
      );
      if (target) this.approach(target);
      else this.walk(point);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.disposed) return;
      const hover = this.actors.some(
        (a) =>
          distance(
            { x: a.target.x, y: a.target.y - 22 },
            { x: pointer.worldX, y: pointer.worldY },
          ) < (a.target.hitRadius ?? 55),
      );
      this.game.canvas.style.cursor = hover
        ? 'pointer'
        : inside(
              { x: pointer.worldX, y: pointer.worldY },
              this.response.catalog.world.polygon,
            )
          ? 'crosshair'
          : 'default';
    });
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute(
      'aria-label',
      'Elderwood village. Move with WASD or arrow keys. E interacts, Space attacks, 1 heals, 2 uses a heavy strike.',
    );
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    this.unsubscribe = this.client.subscribe(() => this.syncState());
    this.bridge.handler = this.intentHandler;
    this.syncActors();
  }

  private keydown = (event: KeyboardEvent) => {
    if (this.disposed) return;
    const key = event.key.toLowerCase();
    if (
      event.target instanceof HTMLElement &&
      (event.target.closest('input,textarea,select,dialog') ||
        (event.target.closest('button') &&
          ![
            'w',
            'a',
            's',
            'd',
            'arrowup',
            'arrowleft',
            'arrowdown',
            'arrowright',
          ].includes(key)))
    )
      return;
    if (
      [
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowleft',
        'arrowdown',
        'arrowright',
        ' ',
        'e',
        '1',
        '2',
      ].includes(key)
    ) {
      event.preventDefault();
      this.keys.add(key);
      if (event.repeat) return;
      if (key === ' ') this.intent({ type: 'attack' });
      if (key === 'e') this.intent({ type: 'interact' });
      if (key === '1') this.intent({ type: 'heal' });
      if (key === '2') this.intent({ type: 'heavy_attack' });
    }
  };
  private keyup = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };
  private blur = () => {
    if (this.disposed) return;
    this.keys.clear();
    this.route = [];
    this.pursuit = null;
    this.flushMove();
  };

  private addActor(target: WorldTarget, frame: number, size: number) {
    const ring = this.add
      .ellipse(target.x, target.y, 48, 18, 0x8eb567, 0.13)
      .setStrokeStyle(1, 0x9abd7b, 0.45)
      .setDepth(2);
    const sprite = this.add
      .image(target.x, target.y - 24, 'sprites', Math.max(0, frame))
      .setDisplaySize(size, (size * 4) / 3)
      .setDepth(target.y / 10);
    if (frame === -1) {
      sprite.setVisible(false);
      this.add
        .ellipse(target.x, target.y, 40, 17, 0x674b2b, 0.8)
        .setStrokeStyle(2, 0x96816a)
        .setDepth(3);
      const flame = this.add
        .text(target.x, target.y - 15, '♨', {
          fontSize: '36px',
          color: '#ffc567',
        })
        .setOrigin(0.5)
        .setDepth(4);
      if (this.motion)
        this.tweens.add({
          targets: flame,
          alpha: 0.65,
          scaleY: 1.12,
          duration: 500,
          repeat: -1,
          yoyo: true,
        });
    }
    const label = this.add
      .text(target.x, target.y - 68, target.label, {
        fontFamily: 'Nunito Sans',
        fontSize: '20px',
        fontStyle: 'bold',
        color: target.kind === 'enemy' ? '#e5d3a2' : '#eee3be',
        stroke: '#1a2118',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(150);
    const bar =
      target.kind === 'enemy' ? this.add.graphics().setDepth(151) : undefined;
    this.actors.push({ target, sprite, ring, label, bar });
  }

  private addEnemy(enemy: Enemy) {
    const dragon = enemy.id === DRAGON_ID;
    this.addActor(
      {
        ...enemy,
        kind: 'enemy',
        label: dragon ? 'Cinderwing · Miniboss' : 'Moss slime',
        hitRadius: dragon ? 78 : 55,
      },
      2,
      dragon ? 190 : 95,
    );
    if (dragon) {
      const actor = this.actors[this.actors.length - 1];
      actor.sprite.setTexture('cinderwing', 0).setDisplaySize(190, 190);
      actor.ring.setSize(115, 38).setStrokeStyle(2, 0xf3a45b, 0.8);
      actor.label.setY(enemy.y - 110).setColor('#ffd09a');
    }
  }

  private syncState() {
    if (this.disposed) return;
    const snapshot = this.client.getSnapshot();
    if (!snapshot.data) return;
    const old = this.response.state;
    this.response = snapshot.data;
    for (const enemy of this.response.state.enemies) {
      if (!this.actors.some((actor) => actor.target.id === enemy.id))
        this.addEnemy(enemy);
    }
    if (
      snapshot.restoreRevision !== this.restoreRevision ||
      (snapshot.error && snapshot.error !== this.wasError) ||
      snapshot.connection === 'offline'
    ) {
      this.route = [];
      this.pursuit = null;
      this.keys.clear();
      this.bridge.position = { ...this.response.state.position };
    }
    this.restoreRevision = snapshot.restoreRevision;
    this.wasError = snapshot.error;
    if (
      this.response.state.version !== old.version &&
      this.response.event === 'rescue'
    ) {
      this.bridge.position = { ...this.response.state.position };
      this.route = [];
      this.pursuit = null;
      this.floatText(this.bridge.position, 'Back to camp', '#f5d48d');
    }
    for (const enemy of this.response.state.enemies) {
      const previous = old.enemies.find((e) => e.id === enemy.id);
      if (previous && enemy.hp < previous.hp) {
        this.floatText(enemy, `−${previous.hp - enemy.hp}`, '#ffe0a0');
        const actor = this.actors.find((a) => a.target.id === enemy.id);
        if (actor) {
          actor.sprite.setTint(0xffd78a);
          this.time.delayedCall(130, () => {
            if (!this.disposed) actor.sprite.clearTint();
          });
        }
      }
    }
    if (this.response.state.hp < old.hp)
      this.floatText(
        this.bridge.position,
        `−${old.hp - this.response.state.hp}`,
        '#ff8e80',
      );
    if (this.response.state.hp > old.hp)
      this.floatText(
        this.bridge.position,
        `+${this.response.state.hp - old.hp}`,
        '#b4de94',
      );
    this.syncActors();
  }

  private syncActors() {
    if (this.disposed) return;
    const now = this.client.serverNow();
    for (const actor of this.actors) {
      const enemy = this.response.state.enemies.find(
        (e) => e.id === actor.target.id,
      );
      const node = this.response.state.nodes.find(
        (n) => n.id === actor.target.id,
      );
      const respawning = enemy && enemy.hp === 0 && now < enemy.respawnAt;
      const waiting = node && now < node.readyAt;
      actor.sprite.setAlpha(respawning ? 0.18 : waiting ? 0.45 : 1);
      actor.ring.setStrokeStyle(
        1,
        this.pursuit?.id === actor.target.id
          ? 0xf5cf75
          : enemy?.id === DRAGON_ID
            ? 0xe99b5b
            : 0x9abd7b,
        0.65,
      );
      actor.label.setText(
        respawning
          ? `Returns in ${Math.ceil((enemy.respawnAt - now) / 1000)}s`
          : waiting
            ? `${actor.target.label} · ${Math.ceil((node.readyAt - now) / 1000)}s`
            : actor.target.label,
      );
      if (actor.bar && enemy) {
        const dragon = enemy.id === DRAGON_ID;
        const width = dragon ? 105 : 48;
        const y = enemy.y - (dragon ? 91 : 57);
        actor.bar.clear();
        if (!respawning) {
          const hp = enemy.hp === 0 ? enemy.maxHp : enemy.hp;
          actor.bar
            .fillStyle(0x171e14, 0.8)
            .fillRoundedRect(enemy.x - width / 2, y, width, dragon ? 8 : 5, 2);
          actor.bar
            .fillStyle(dragon ? 0xe78045 : 0x95ae5b)
            .fillRoundedRect(
              enemy.x - width / 2,
              y,
              (width * hp) / enemy.maxHp,
              dragon ? 8 : 5,
              2,
            );
        }
      }
    }
  }

  private floatText(point: Point, text: string, color: string) {
    if (this.disposed) return;
    const object = this.add
      .text(point.x, point.y - 65, text, {
        fontFamily: 'Nunito Sans',
        fontStyle: 'bold',
        fontSize: '25px',
        color,
        stroke: '#20231b',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(200);
    this.tweens.add({
      targets: object,
      y: object.y - 35,
      alpha: 0,
      duration: 950,
      onComplete: () => object.destroy(),
    });
  }

  private walk(point: Point) {
    if (this.client.getSnapshot().connection !== 'online') return;
    const route = findPath(
      this.bridge.position,
      point,
      this.response.catalog.world.polygon,
    );
    if (!route.length) return;
    this.route = route;
    this.pursuit = null;
    this.bridge.target = null;
    this.marker.setPosition(point.x, point.y).setVisible(true);
  }

  private approach(target: WorldTarget) {
    const state = this.response.state;
    const enemy = state.enemies.find((e) => e.id === target.id);
    const node = state.nodes.find((n) => n.id === target.id);
    if (enemy?.hp === 0 && this.client.serverNow() < enemy.respawnAt) {
      this.client.notice(
        `${enemy.id === DRAGON_ID ? 'Cinderwing' : 'This slime'} will return shortly.`,
      );
      return;
    }
    if (node && Date.now() < node.readyAt) {
      this.client.notice('Let this resource replenish for a moment.');
      return;
    }
    if (distance(this.bridge.position, target) > 80) {
      const route = findPath(
        this.bridge.position,
        target,
        this.response.catalog.world.polygon,
      );
      if (!route.length) return;
      this.route = route;
    }
    this.pursuit = target;
    this.bridge.target = target;
    this.marker.setPosition(target.x, target.y).setVisible(true);
  }

  private intent(intent: Intent) {
    if (this.disposed) return;
    if (intent.type === 'target') {
      const actor = this.actors.find((a) => a.target.id === intent.id);
      if (actor) this.approach(actor.target);
    } else if (intent.type === 'heal') {
      void this.actAfterMovement({ type: 'heal' });
    } else if (intent.type === 'equip') {
      void this.actAfterMovement({ type: 'equip', target: intent.id });
    } else if (intent.type === 'rest') {
      const camp = this.actors.find((a) => a.target.kind === 'camp');
      if (camp) this.approach(camp.target);
    } else if (intent.type === 'attack' || intent.type === 'heavy_attack') {
      const enemy = this.actors
        .filter(
          (a) =>
            a.target.kind === 'enemy' &&
            distance(a.target, this.bridge.position) <= 105 &&
            this.enemyReady(a.target.id),
        )
        .sort(
          (a, b) =>
            distance(a.target, this.bridge.position) -
            distance(b.target, this.bridge.position),
        )[0];
      if (enemy) {
        this.route = [];
        this.pursuit = null;
        void this.attack(enemy.target, intent.type);
      } else this.client.notice('Move closer to an enemy to attack.');
    } else {
      const nearest = this.actors
        .filter((a) => distance(a.target, this.bridge.position) < 120)
        .sort(
          (a, b) =>
            distance(a.target, this.bridge.position) -
            distance(b.target, this.bridge.position),
        )[0];
      if (nearest) this.approach(nearest.target);
      else
        this.client.notice(
          'Approach a resource, the smith, or the camp to interact.',
        );
    }
  }

  private enemyReady(id: string) {
    const enemy = this.response.state.enemies.find((e) => e.id === id);
    return (
      enemy && (enemy.hp > 0 || this.client.serverNow() >= enemy.respawnAt)
    );
  }

  private async tickDragon() {
    if (this.ticking || this.disposed) return;
    this.ticking = true;
    this.lastTickAt = performance.now();
    try {
      if ((await this.flushMove()) && !this.disposed)
        await this.client.send({ type: 'tick' });
    } finally {
      this.ticking = false;
    }
  }

  private async actAfterMovement(input: CommandInput) {
    if ((await this.flushMove()) && !this.disposed)
      return this.client.send(input);
    return false;
  }

  private drawDragon(time: number) {
    this.breathGround.clear();
    this.breathFlames.clear();
    const dragon = this.response.state.enemies.find(
      (enemy) => enemy.id === DRAGON_ID,
    );
    if (!dragon) return;
    const actor = this.actors.find((a) => a.target.id === DRAGON_ID);
    if (!actor) return;
    const now = this.client.serverNow();
    const phase = breathPhase(dragon, now);
    actor.sprite.setFrame(
      phase === 'warning'
        ? 1
        : phase === 'fire'
          ? 2
          : phase === 'recovering'
            ? 3
            : 0,
    );
    if (dragon.breath)
      actor.sprite.setFlipX(dragon.breath.aim.x > dragon.breath.origin.x);
    else actor.sprite.setFlipX(this.bridge.position.x > dragon.x);
    if (!dragon.breath || (phase !== 'warning' && phase !== 'fire')) return;
    const { origin, aim, startsAt } = dragon.breath;
    const points = breathCone(origin, aim).map(
      (point) => new Phaser.Math.Vector2(point.x, point.y),
    );
    const warning = phase === 'warning';
    const pulse = this.motion ? (Math.sin(time / 85) + 1) * 0.1 : 0;
    this.breathGround
      .fillStyle(warning ? 0xff852e : 0xee4c14, warning ? 0.2 + pulse : 0.36)
      .fillPoints(points, true);
    this.breathGround
      .lineStyle(3, warning ? 0xffb956 : 0xffe3a0, 0.95)
      .strokePoints(points, true);
    if (warning && startsAt !== this.lastBreath) {
      this.lastBreath = startsAt;
      this.client.notice('Cinderwing inhales! Step out of the orange cone.');
    }
    if (!warning) {
      const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
      for (let i = 0; i < 35; i++) {
        const t = this.motion ? (time / 440 + i * 0.071) % 1 : (i + 1) / 36;
        const spread = Math.sin(i * 17) * BREATH_HALF_ANGLE * 0.88;
        const x = origin.x + Math.cos(angle + spread) * BREATH_RANGE * t;
        const y =
          origin.y +
          Math.sin(angle + spread) * BREATH_RANGE * t -
          Math.sin(t * Math.PI) * 18;
        const size = 5 + t * 16;
        this.breathFlames
          .fillStyle(
            i % 3 === 0 ? 0xffefad : i % 2 ? 0xffbc45 : 0xff5a20,
            (1 - t) * 0.85,
          )
          .fillCircle(x, y, size);
      }
    }
  }

  private flushMove() {
    if (this.disposed) return Promise.resolve(false);
    const point = { ...this.bridge.position };
    if (distance(point, this.response.state.position) > 0.5) {
      this.lastSync = Date.now();
      return this.client.send({ type: 'move', x: point.x, y: point.y });
    }
    return Promise.resolve(true);
  }

  private async attack(
    target: WorldTarget,
    type: 'attack' | 'heavy_attack' = 'attack',
  ) {
    if (this.disposed || !this.attackCooldown.begin(Date.now())) return;
    try {
      if (!(await this.flushMove()) || this.disposed) return;
      if (await this.client.send({ type, target: target.id })) {
        if (this.disposed) return;
        if (this.motion)
          this.tweens.add({
            targets: this.hero,
            angle: this.hero.flipX ? -13 : 13,
            duration: 90,
            yoyo: true,
          });
      }
    } finally {
      this.attackCooldown.complete(Date.now());
    }
  }

  update(time: number, delta: number) {
    if (this.disposed || !this.hero) return;
    const active = this.client.getSnapshot().connection === 'online';
    const point = this.bridge.position;
    let dx = 0,
      dy = 0;
    if (active) {
      dx =
        Number(this.keys.has('d') || this.keys.has('arrowright')) -
        Number(this.keys.has('a') || this.keys.has('arrowleft'));
      dy =
        Number(this.keys.has('s') || this.keys.has('arrowdown')) -
        Number(this.keys.has('w') || this.keys.has('arrowup'));
    }
    if (dx || dy) {
      this.route = [];
      this.pursuit = null;
    }
    const pursuit = this.pursuit;
    if (active && pursuit && distance(point, pursuit) < 80) {
      this.route = [];
      this.marker.setVisible(false);
      if (pursuit.kind === 'enemy') {
        if (this.enemyReady(pursuit.id)) void this.attack(pursuit);
        else this.pursuit = null;
      } else {
        this.pursuit = null;
        void this.flushMove().then((ok) => {
          if (!ok || this.disposed) return;
          if (pursuit.kind === 'smithy') {
            this.onSmithy();
            this.client.notice(
              'Bram: A good blade starts with good iron. What shall we forge?',
            );
          }
          if (pursuit.kind === 'resource')
            void this.client.send({ type: 'gather', target: pursuit.id });
          if (pursuit.kind === 'camp') void this.client.send({ type: 'rest' });
        });
      }
    }
    if (active && this.route.length && !dx && !dy) {
      const next = this.route[0];
      if (distance(point, next) < 3) {
        this.bridge.position = { ...next };
        this.route.shift();
        void this.flushMove();
      } else {
        dx = next.x - point.x;
        dy = next.y - point.y;
      }
    }
    const length = Math.hypot(dx, dy);
    const moving =
      active && length > 0 && this.client.getSnapshot().pending < 4;
    if (moving) {
      const step = Math.min(
        length,
        (this.response.catalog.world.speed * Math.min(delta, 50)) / 1000,
      );
      // Keyboard direction has unit length; path vectors have map-unit length.
      const amount = this.route.length
        ? step
        : (this.response.catalog.world.speed * Math.min(delta, 50)) / 1000;
      const next = {
        x: point.x + (dx / length) * amount,
        y: point.y + (dy / length) * amount,
      };
      if (segmentInside(point, next, this.response.catalog.world.polygon))
        this.bridge.position = next;
      if (dx !== 0) this.hero.setFlipX(dx < 0);
      if (Date.now() - this.lastSync > 350) void this.flushMove();
    }
    if (this.moving && !moving) {
      void this.flushMove();
      this.marker.setVisible(false);
    }
    this.moving = moving;
    this.hero.setPosition(
      this.bridge.position.x,
      this.bridge.position.y -
        42 +
        (moving && this.motion ? Math.sin(time / 65) * 3 : 0),
    );
    this.hero.setDepth(this.bridge.position.y / 10 + 1);
    this.shadow.setPosition(this.bridge.position.x, this.bridge.position.y);
    const dragon = this.response.state.enemies.find(
      (enemy) => enemy.id === DRAGON_ID,
    );
    if (
      active &&
      this.client.getSnapshot().pending === 0 &&
      this.client.sinceDispatch() >= 400 &&
      performance.now() - this.lastTickAt >= 400 &&
      needsDragonTick(dragon, this.bridge.position)
    )
      void this.tickDragon();
    this.drawDragon(time);
    if (Math.floor(time / 250) !== Math.floor((time - delta) / 250))
      this.syncActors();
    for (const actor of this.actors)
      if (actor.target.kind === 'enemy' && this.motion)
        actor.sprite.y =
          actor.target.y - 24 + Math.sin(time / 430 + actor.target.x) * 3;
  }
}
