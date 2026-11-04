import Phaser from 'phaser';
import { CELL, LANE, LEGION_DATA, MELEE_RANGE, MODE_IDS, STATUS, type AttackType, type ModeId, type AuraStat, type GameEvent, type KingStat, type TeamId, type UnitState } from '@legion/shared';
import { DIR, KING_SPRITES, UNIT_SPRITES, spriteKey, type FxKey, type SoundKey } from '../assets/manifest.ts';
import { CANVAS_W, FIELD_H, FIELD_TOP, FIELD_ZOOM as HUD_FIELD_ZOOM, SCALE, SHOWCASE, UI_ZOOM, VIEW_W } from '../layout.ts';
import { SHOWCASE_FIELD, showcaseParams, type ShowcaseScene } from '../showcase/ShowcaseScene.ts';
import { ellipseTexture } from '../render/ellipse.ts';
import { FieldMap, LANE_PX, MAP_GAP, type MapSlot } from '../render/fieldMap.ts';
import { FX_SOUND, SHOT_SOUND, sfx } from '../audio/sfx.ts';
import { clearRejoin } from '../net/rejoin.ts';
import { attackStyle } from '../render/attackStyle.ts';
import { settings } from '../settings.ts';
import { SwingTrails, bodyMotion, projectile, weaponFor, weaponSwing, type Recoil } from '../render/combat.ts';
import { LocalSession, type SoloConfig } from '../session/LocalSession.ts';
import type { NetSession } from '../session/NetSession.ts';
import type { Session } from '../session/Session.ts';
import { SoloReport } from '../soloReport.ts';
import { KING_SLOTS, REROLL_SLOT, SEND_PAGE_SIZE, type SlotMode } from '../ui/Hud.ts';
import { SLOT_KEYS, onKey } from '../ui/keys.ts';
import { TOUCH } from '../ui/touch.ts';
import { ME_COLOR, seatColor } from '../ui/playerColors.ts';
import { FONT } from './BootScene.ts';
import type { UiLink, UiScene } from './UiScene.ts';

const AURA_GLOW: Record<AuraStat, number> = { damage: 0xff6040, armor: 0x60a0ff, attackSpeed: 0xffe060, regen: 0x60ff90 };
/** Canvas pixels per field pixel; showcase clips zoom in closer. */
const FIELD_ZOOM = SHOWCASE ? SHOWCASE_FIELD.zoom : HUD_FIELD_ZOOM;
/** Visible battlefield size in field pixels at the camera zoom. */
const VIEW_FIELD_W = CANVAS_W / FIELD_ZOOM;
const VIEW_FIELD_H = (SHOWCASE ? SHOWCASE_FIELD.height : FIELD_H * UI_ZOOM) / FIELD_ZOOM;
/** Ground drawn beyond the map's sides. */
const FIELD_MARGIN = 48;
/** The lane is shorter than the view: all of the rest goes above, where the top row's heads stick out. */
const HEADROOM = (VIEW_FIELD_H - LANE_PX.h) / 2;
/** Ground above each area, so a centred view shows no dark gap; the rest of MAP_GAP stays dark as a divider. */
const GROUND_TOP = HEADROOM * 2;
/** Field labels in HUD-sized pixels (2 canvas px per font pixel); showcase clips keep their look. */
const LABEL_SCALE = SHOWCASE ? 2 / 3 : UI_ZOOM / FIELD_ZOOM;
/** Camera pan speed for arrow keys, field px per second. */
const PAN_SPEED = 220;
/** A touch that moves this far (canvas px) is a swipe that pans, not a tap. */
const TOUCH_PAN_PX = 16;
/** After a drag on the map the view settles on the nearest area once left alone this long. */
const SNAP_MS = 600;
/** Mouse wheel travel per step to the next area (one notch is usually 100). */
const WHEEL_STEP = 100;
/** Creeps and sends are drawn smaller than the fighters, so a crowded lane stays readable. */
const ATTACKER_SCALE = 0.75;
/** Nova effects by ability name, else by the caster's attack type. */
const NOVA_FX: Record<string, FxKey> = { Torrent: 'waterpillar', Shockwave: 'rockspike', 'Royal Stomp': 'rockspike', 'Plague Cloud': 'magic' };
const GLOW_FX = new Set<FxKey>(['explosion', 'spark', 'magic', 'boost', 'thunder', 'cut', 'claw', 'clawdouble', 'cutdouble', 'slashcurved', 'spirit', 'holy']);
/** Pause between two hit flashes on the same unit. */
const FLASH_GAP_MS = 250;
/** Hit flash of the local player's own units. */
const HURT_FLASH = 0xff4040;
/** Dashed line from the selected/hovered unit to its target, and the ring on the target. */
const TARGET_COLOR = 0xff6050;
const TARGET_TINT = 0xff9080;
/** Moves longer than this per frame are teleports, not walking. */
const TELEPORT_PX = 20;
const NOVA_FX_BY_TYPE: Record<AttackType, FxKey> = { normal: 'rockspike', pierce: 'frost', siege: 'explosion', magic: 'magic', chaos: 'flame' };

interface UnitView {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  lastX: number;
  /** Smoothed horizontal speed (px per frame); crowd jostling stays below the walk threshold. */
  speed: number;
  /** Until then the unit holds its attack pose (characters) or bites fast (monsters). */
  attackUntil: number;
  facingRight: boolean;
  /** Fighters look down (at the player) until they first move or strike in a wave. */
  faceDown: boolean;
  /** Set once the fighter moved or attacked this wave; cleared when the next build phase starts. */
  fought: boolean;
  flashUntil: number;
  /** Base sprite scale from the manifest. */
  scale: number;
  recoil: Recoil;
  /** Unit definition the view was built for (upgrades rebuild it). */
  def: string;
  /** Pulsing aura ring for aura carriers. */
  ring?: Phaser.GameObjects.Image;
  /** Ring in the owner's colour under fighters and sends. */
  ownerRing?: Phaser.GameObjects.Image;
}

/**
 * The battlefield: one lane or king arena at a time, rendered in field pixels through a
 * zoomed camera that follows the fighting. The HUD lives in UiScene on top.
 */
export class BattleScene extends Phaser.Scene {
  private session!: Session;
  /** Solo setup, kept for "play again"; null online. */
  private solo: SoloConfig | null = null;
  /** Tells the server's stats page about this solo game; null online. */
  private soloReport: SoloReport | null = null;
  /** Index of the local player in the game. */
  private me = 0;
  /** Online builds appear with the next state patch; select them once they do. */
  private pendingSelect: { col: number; row: number; until: number } | null = null;
  private views = new Map<number, UnitView>();
  /** Where every lane and arena sits on the scrollable map. */
  private map!: FieldMap;
  /** Areas on screen this frame: only their units are drawn and only their events make effects and sound. */
  private readonly shown = new Set<number>();
  /** Fighter slot armed for placement; cleared after one placement unless Shift is held. */
  private selectedBuild: number | null = null;
  /** Chosen slot mode for the build phase; a running wave always shows sends. */
  private slotMode: SlotMode = 'build';
  private sendPage = 0;
  private selectedUnit: number | null = null;
  private hoverUnit: number | null = null;
  private hoverCell: { col: number; row: number } | null = null;
  /** Touch on the battlefield until release; `panned` once it moved far enough to be a swipe. */
  private touchStart: { x: number; y: number; panned: boolean } | null = null;
  private leaksAtWaveStart: number[] = [];
  private lastPhase: string = 'build';
  /** Camera centre (field px) and until when manual panning overrides the auto camera. */
  private camX = LANE_PX.w - VIEW_FIELD_W / 2;
  private manualCamUntil = 0;
  private camY = 0;
  /** Row the camera glides to (an area's middle); null while the player drags the map. */
  private targetY: number | null = null;
  private draggedAt = 0;
  private wheelTravel = 0;

  /** Ground and (lanes) "TO KING" label of every area, hidden while off screen. Area names are drawn by the minimap. */
  private grounds: { slot: MapSlot; ground: Phaser.GameObjects.TileSprite; kingMark?: Phaser.GameObjects.BitmapText }[] = [];
  private grid!: Phaser.GameObjects.Graphics;
  /** "YOU" over the own grid while building. */
  private youMark!: Phaser.GameObjects.BitmapText;
  private ghost!: Phaser.GameObjects.Sprite;
  /** Pulsing ring and bobbing arrow on the selected unit. */
  private selRing!: Phaser.GameObjects.Ellipse;
  /** HP bars of all units, redrawn each frame in one object (one per unit would cost a draw call each). */
  private hpBars!: Phaser.GameObjects.Graphics;
  private trails!: SwingTrails;
  private selArrow!: Phaser.GameObjects.Triangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('battle');
  }

  /** Online games hand in their session; solo games their setup (or take it from the URL). */
  init(data?: { session?: Session; solo?: SoloConfig }): void {
    this.solo = data?.solo ?? (data?.session ? null : soloFromUrl());
    this.session = data?.session ?? this.localSession(this.solo!);
    this.me = this.session.localPlayer;
    this.session.onError = (message) => this.ui.floatText(message.toUpperCase(), 0xff6060);
    this.session.onConnection = (status) => {
      if (this.session.game.phase === 'over') return;
      if (status === 'dropped') this.ui.showBanner(['CONNECTION LOST', 'RECONNECTING...'], 0);
      else if (status === 'back') this.ui.showBanner(['RECONNECTED!']);
      else this.ui.showBanner(['DISCONNECTED', 'RELOAD WITHIN 60S TO REJOIN'], 0);
    };
    this.views.clear();
    this.selectedBuild = null;
    this.selectedUnit = null;
  }

  private localSession(config: SoloConfig): Session {
    // Dev aid: `?fast` shortens build phases for quick playtests.
    const data = new URLSearchParams(location.search).has('fast')
      ? { ...LEGION_DATA, rules: { ...LEGION_DATA.rules, firstBuildMs: 8000, buildBaseMs: 8000, buildPerWaveMs: 0, arenaBuildMs: 8000 } }
      : LEGION_DATA;
    // Dev aid: `?auto` lets a bot play the own seat in a normal game (HUD screenshots, promo clips);
    // `seed`/`wave` work as in showcase clips.
    if (!SHOWCASE && !new URLSearchParams(location.search).has('auto')) return new LocalSession(data, config);
    const { seed, wave } = showcaseParams();
    const session = new LocalSession(data, config, { seed, autopilot: true });
    if (wave > 1) session.skipToWave(wave);
    return session;
  }

  create(): void {
    const game = this.session.game;
    this.map = new FieldMap(game, this.me);
    // Ground reaches past the map's sides so the margin the camera shows isn't void; arenas are paved
    // as wide as the lanes. Whole 16 px tiles keep the grass in step with the grid. Above each area it
    // covers the headroom, so only the rest of the gap shows as a dark divider while scrolling.
    const side = Math.ceil((Math.max(0, (VIEW_FIELD_W - LANE_PX.w) / 2) + FIELD_MARGIN) / 16) * 16;
    this.grounds = this.map.slots.map((slot) => ({
      slot,
      ground: this.add.tileSprite(-side, slot.y - GROUND_TOP, LANE_PX.w + side * 2, slot.h + GROUND_TOP, slot.kind === 'lane' ? 'grass' : 'stone').setOrigin(0, 0),
      // Halfway down the leak line, under the units.
      kingMark:
        slot.kind === 'lane'
          ? this.add.bitmapText(slot.x + LANE.leakX * SCALE - 2, slot.y + slot.h / 2, FONT, 'TO KING').setOrigin(1, 0.5).setScale(LABEL_SCALE).setTint(0xff9090).setDepth(2)
          : undefined,
    }));
    this.grid = this.add.graphics().setDepth(1);
    // "YOU" sits in the headroom above the own grid.
    this.youMark = this.add.bitmapText(0, 0, FONT, 'YOU').setOrigin(0.5, 1).setScale(LABEL_SCALE).setTint(ME_COLOR).setDepth(9001);
    this.hpBars = this.add.graphics().setDepth(9999);
    // Above the units, under HP bars and hit effects.
    this.trails = new SwingTrails(this, 9990);
    this.ghost = this.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, 1).setAlpha(0.6).setVisible(false).setDepth(9000);
    this.selRing = this.add.ellipse(0, 0, 18, 7).setStrokeStyle(1, 0xfff060).setFillStyle(0xfff060, 0.25).setVisible(false);
    this.tweens.add({ targets: this.selRing, scaleX: 1.2, scaleY: 1.2, alpha: 0.5, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.selArrow = this.add.triangle(0, 0, 0, 0, 6, 0, 3, 4, 0xfff060).setStrokeStyle(1, 0x303048).setOrigin(0.5, 1).setVisible(false).setDepth(9998);

    const cam = this.cameras.main;
    if (SHOWCASE) cam.setViewport(0, SHOWCASE_FIELD.top, CANVAS_W, SHOWCASE_FIELD.height);
    else cam.setViewport(0, FIELD_TOP * UI_ZOOM, CANVAS_W, FIELD_H * UI_ZOOM);
    cam.setZoom(FIELD_ZOOM).setBackgroundColor('#0b0b18');
    cam.filters.external.addVignette(0.5, 0.5, 0.95, 0.3);

    const link: UiLink = {
      game,
      player: this.me,
      minimap: {
        map: this.map,
        view: () => ({ top: this.camY - VIEW_FIELD_H / 2, bottom: this.camY + VIEW_FIELD_H / 2 }),
        lookAt: (fy) => this.drag(fy - this.camY),
        wheel: (dy) => this.wheel(dy),
      },
      actions: {
        pickSlot: (i) => this.slotKey(i),
        pickMode: (mode) => this.pickMode(mode),
        toggleTypeChart: () => this.ui.toggleTypeChart(),
        upgrade: (to) => this.upgradeSelected(to),
        sell: () => this.sellSelected(),
      },
      chat: this.session.chat,
      state: () => ({
        selectedBuild: this.selectedBuild,
        selectedUnit: this.selectedUnit,
        hoverUnit: this.hoverUnit,
        slotMode: this.mode,
        sendPage: this.sendPage,
      }),
    };
    this.scene.launch('ui', link);
    // Showcase clips hide the HUD (UiScene) and draw their own captions on top.
    if (SHOWCASE) this.scene.launch('showcase', { game: (this.session as LocalSession).game });

    this.setupInput();
    // Start on the own lane (or the clip's) without gliding there from the top of the map.
    this.setView(SHOWCASE ? showcaseParams().lane : this.me);
    this.camY = this.targetY!;
    this.updateShown();

    // Showcase games are not real games: keep them out of the stats.
    this.soloReport = this.solo && !SHOWCASE ? new SoloReport(this.session.game, this.solo) : null;
    // Menu or play again before the end: the game was left.
    this.events.once('shutdown', () => this.soloReport?.end(null, true));
  }

  override update(_time: number, delta: number): void {
    // The tail of a showcase clip after the wave ended holds the last picture, camera included: the
    // sim already put the fighters back on their cells in the tick the last creep died or leaked.
    const holdClip = () => SHOWCASE && this.session.game.phase !== 'fight' && (this.scene.get('showcase') as ShowcaseScene).recording;
    // Showcase clips hurry through the build phases, which make dull footage.
    const speed = SHOWCASE && this.session.game.phase === 'build' ? SHOWCASE_FIELD.buildSpeed : 1;
    const events = holdClip() ? [] : this.session.update(delta * speed);
    for (const ev of events) this.handleEvent(ev);
    if (!holdClip()) this.updateCamera(delta / 1000);
    this.updateShown();
    // Units (and the map) move under a resting mouse, so re-check what it points at every frame.
    // A finger leaves no resting pointer: there the tap selects.
    const pointer = this.input.activePointer;
    const world = pointer.wasTouch ? null : this.pointerWorld(pointer);
    this.hoverUnit = this.selectedBuild === null && world ? this.unitAt(world.x, world.y) : null;
    if (!pointer.wasTouch) this.hoverCell = world ? this.cellAt(world.x, world.y) : null;
    if (this.pendingSelect) {
      const placed = this.fighterAt(this.pendingSelect.col, this.pendingSelect.row);
      if (placed) this.selectedUnit = placed.id;
      if (placed || this.time.now > this.pendingSelect.until) this.pendingSelect = null;
    }
    if (!holdClip()) this.syncUnits();
    this.trails.draw();
    this.drawGrid();
  }

  private get ui(): UiScene {
    return this.scene.get('ui') as UiScene;
  }

  // ---- camera ---------------------------------------------------------------

  /**
   * Scrolls the map up and down: glides to a chosen area, or follows a drag and then settles on
   * the nearest area. Sideways it follows the fighting (or the build grid) unless the player pans
   * manually; at the normal HUD zoom the whole lane fits and it just sits in the middle.
   */
  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    // A dragged map settles once let go, so no lane stays half off screen.
    if (this.targetY === null && this.time.now > this.draggedAt + SNAP_MS && !this.input.activePointer.isDown) this.targetY = this.focusY(this.map.nearest(this.camY));
    if (this.targetY !== null) this.camY = Math.abs(this.targetY - this.camY) < 0.5 ? this.targetY : this.camY + (this.targetY - this.camY) * Math.min(1, dt * 8);
    const first = this.map.slots[0]!;
    const last = this.map.slots[this.map.slots.length - 1]!;
    this.camY = Phaser.Math.Clamp(this.camY, this.focusY(first), this.focusY(last));
    const pan = this.ui.keysCaptured ? 0 : (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
    if (pan) {
      this.camX += pan * PAN_SPEED * dt;
      this.manualCamUntil = this.time.now + 3000;
    }
    if (this.time.now > this.manualCamUntil) {
      const target = this.autoCameraX(this.viewArea);
      this.camX += (target - this.camX) * Math.min(1, dt * 3);
    }
    this.camX = LANE_PX.w <= VIEW_FIELD_W ? LANE_PX.w / 2 : Phaser.Math.Clamp(this.camX, VIEW_FIELD_W / 2, LANE_PX.w - VIEW_FIELD_W / 2);
    cam.centerOn(Math.round(this.camX), Math.round(this.camY));
  }

  /** The area in view, or the one the camera is gliding to (a lane index or an arena). */
  private get viewArea(): number {
    return this.map.nearest(this.targetY ?? this.camY).area;
  }

  /** Camera row that shows an area whole, the top row's heads included. */
  private focusY(slot: MapSlot): number {
    return slot.y + slot.h / 2 - HEADROOM;
  }

  /** Moves the map by a drag (touch swipe, minimap); it settles on an area once let go. */
  private drag(dy: number): void {
    this.camY += dy;
    this.targetY = null;
    this.draggedAt = this.time.now;
  }

  /** Next (1) or previous (-1) area on the map: wheel, arrow keys, Tab (`wrap`). */
  private step(dir: number, wrap = false): void {
    const slots = this.map.slots;
    const at = slots.indexOf(this.map.slot(this.viewArea)) + dir;
    const next = wrap ? slots[(at + slots.length) % slots.length] : slots[Phaser.Math.Clamp(at, 0, slots.length - 1)];
    this.setView(next!.area);
  }

  /** The wheel steps from area to area; a trackpad's small deltas add up to a step. */
  private wheel(dy: number): void {
    this.wheelTravel += dy;
    if (Math.abs(this.wheelTravel) < WHEEL_STEP) return;
    this.step(Math.sign(this.wheelTravel));
    this.wheelTravel = 0;
  }

  /** Shows the units, ground and marks of the areas on screen; the rest of the map stays hidden. */
  private updateShown(): void {
    const top = this.camY - VIEW_FIELD_H / 2;
    const bottom = top + VIEW_FIELD_H;
    this.shown.clear();
    for (const { slot, ground, kingMark } of this.grounds) {
      const on = slot.y + slot.h > top && slot.y - MAP_GAP < bottom;
      if (on) this.shown.add(slot.area);
      ground.setVisible(on);
      kingMark?.setVisible(on);
    }
  }

  private autoCameraX(area: number): number {
    const game = this.session.game;
    const gridCenter = (LANE.gridX + (LANE.gridCols * CELL) / 2) * SCALE;
    const units = [...game.units.values()].filter((u) => u.area === area && !u.dead && u.kind !== 'king');
    if (game.phase !== 'fight') {
      // Showcase clips are too narrow for the whole grid: frame the army instead.
      const army = SHOWCASE ? units.filter((u) => u.kind === 'fighter') : [];
      return army.length ? (army.reduce((n, u) => n + u.x, 0) / army.length) * SCALE : gridCenter;
    }
    // A boss clip is about the boss: keep it in frame.
    const boss = SHOWCASE ? units.find((u) => u.kind === 'creep' && game.def(u).boss) : undefined;
    if (boss) return boss.x * SCALE;
    const engaged = units.filter((u) => u.targetId !== null);
    if (engaged.length) return (engaged.reduce((n, u) => n + u.x, 0) / engaged.length) * SCALE;
    const attackers = units.filter((u) => u.kind === 'creep' || u.kind === 'merc');
    // Watch the head of the incoming wave.
    if (attackers.length) return Math.max(...attackers.map((u) => u.x)) * SCALE - 40;
    // A cleared lane in a showcase clip: hold the shot where the fight ended.
    return SHOWCASE ? this.camX : gridCenter;
  }

  /** Pointer position in field pixels, or null outside the battlefield viewport. */
  private pointerWorld(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    if (p.y < FIELD_TOP * UI_ZOOM || p.y >= (FIELD_TOP + FIELD_H) * UI_ZOOM) return null;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  }

  // ---- input --------------------------------------------------------------

  private setupInput(): void {
    const kb = this.input.keyboard!;
    // Hotkeys stay quiet while a chat line is typed.
    const key = (event: string, fn: (e: KeyboardEvent) => void) => onKey(kb, event, (e) => !this.ui.keysCaptured && fn(e));
    this.cursors = kb.createCursorKeys();
    // Command card: QWER / ASDF / YXCV as labelled on a German keyboard; Z also works for QWERTY.
    const slot = (i: number) => () => this.session.game.phase !== 'over' && this.slotKey(i);
    SLOT_KEYS.forEach((k, i) => key(`keydown-${k}`, slot(i)));
    key('keydown-Z', slot(SLOT_KEYS.indexOf('Y')));
    key('keydown-N', () => this.nextSendPage());
    key('keydown-ONE', () => this.pickMode('build'));
    key('keydown-TWO', () => this.pickMode('send'));
    key('keydown-THREE', () => this.pickMode('king'));
    key('keydown-T', () => this.ui.toggleTypeChart());
    key('keydown-O', () => this.ui.toggleOptions());
    key('keydown-I', () => this.ui.toggleWavePreview());
    key('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.step(e.shiftKey ? -1 : 1, true);
    });
    key('keydown-UP', () => this.step(-1));
    key('keydown-DOWN', () => this.step(1));
    // Space jumps home: own lane first, a second press to the own king.
    key('keydown-SPACE', (e: KeyboardEvent) => {
      e.preventDefault();
      if (this.ui.introOpen) return;
      const game = this.session.game;
      this.setView(this.viewArea === this.me ? game.arenaOf(game.players[this.me]!.team) : this.me);
    });
    key('keydown-ESC', () => !this.ui.introOpen && (this.ui.optionsOpen ? this.ui.toggleOptions() : this.session.game.phase === 'over' ? this.toMenu() : this.clearSelection()));
    key('keydown-R', () => this.session.game.phase === 'over' && this.playAgain());
    key('keydown-U', () => this.upgradeSelected());
    key('keydown-DELETE', () => this.sellSelected());
    key('keydown-BACKSPACE', () => this.sellSelected());
    // Tab 3's buys also work from the other tabs.
    key('keydown-B', () => this.buyWorker());
    key('keydown-H', () => this.upgradeKing('hp'));
    key('keydown-J', () => this.upgradeKing('attack'));
    key('keydown-K', () => this.upgradeKing('regen'));
    key('keydown-G', () => this.upgradeFarm());

    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.pointerWorld(p) && this.wheel(dy));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => p.wasTouch && this.touchDrag(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const w = this.pointerWorld(p);
      // Touch acts on release, so a swipe can pan the camera instead.
      if (p.wasTouch) return void (this.touchStart = w ? { x: p.x, y: p.y, panned: false } : null);
      if (!w) return; // HUD area
      if (p.rightButtonDown()) return this.clearSelection();
      // One unit per click; Shift keeps the slot armed for placing several.
      this.fieldClick(w, (p.event as MouseEvent).shiftKey);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const start = this.touchStart;
      this.touchStart = null;
      const w = this.pointerWorld(p);
      if (p.wasTouch && start && !start.panned && w) this.touchTap(w);
    });
  }

  /** Click or tap on the battlefield: select an own fighter, place the armed one, or pick any unit. */
  private fieldClick(w: { x: number; y: number }, keepArmed: boolean): void {
    this.ui.hideSummary();
    if (this.ui.typeChartOpen) return this.ui.toggleTypeChart();
    if (this.ui.optionsOpen) return;
    const cell = this.cellAt(w.x, w.y);
    const own = cell ? this.fighterAt(cell.col, cell.row) : undefined;
    if (own) {
      this.selectedBuild = null;
      this.selectedUnit = own.id;
      return;
    }
    const unit = this.selectedBuild !== null ? this.fighters()[this.selectedBuild] : undefined;
    if (cell && unit) {
      const result = this.session.send({ type: 'build', unit, col: cell.col, row: cell.row });
      this.feedback(result, undefined, 'build');
      if (!result.ok) return;
      // Still armed: the info panel keeps showing the fighter to place, not the one just built.
      if (keepArmed) return;
      this.selectedBuild = null;
      this.selectedUnit = this.fighterAt(cell.col, cell.row)?.id ?? null;
      if (this.selectedUnit === null) this.pendingSelect = { ...cell, until: this.time.now + 1500 };
      return;
    }
    this.selectedUnit = this.unitAt(w.x, w.y);
  }

  /**
   * Touch has no hover: with a fighter armed, the first tap on a free spot shows the placement
   * preview and a second tap there builds. The slot stays armed until tapped again or a tap
   * lands off the grid.
   */
  private touchTap(w: { x: number; y: number }): void {
    if (this.ui.optionsOpen) return;
    const cell = this.cellAt(w.x, w.y);
    const previewed = !!cell && this.hoverCell?.col === cell.col && this.hoverCell.row === cell.row;
    this.hoverCell = cell;
    if (this.selectedBuild !== null) {
      if (!cell) this.selectedBuild = null;
      else if (!previewed && !this.fighterAt(cell.col, cell.row)) return;
    }
    this.fieldClick(w, true);
  }

  /** One-finger swipe on the battlefield scrolls the map (and pans a lane wider than the view). */
  private touchDrag(p: Phaser.Input.Pointer): void {
    const start = this.touchStart;
    if (!start || !p.isDown) return;
    if (!start.panned && Math.hypot(p.x - start.x, p.y - start.y) < TOUCH_PAN_PX) return;
    start.panned = true;
    this.camX -= (p.x - p.prevPosition.x) / FIELD_ZOOM;
    this.manualCamUntil = this.time.now + 3000;
    this.drag(-(p.y - p.prevPosition.y) / FIELD_ZOOM);
  }

  private clearSelection(): void {
    this.selectedBuild = null;
    this.selectedUnit = null;
    this.ui.unpinWavePreview();
  }

  private get mode(): SlotMode {
    return this.slotMode;
  }

  /** Fighters can be browsed during a wave too; placing them waits for the build phase. */
  private setSlotMode(mode: SlotMode): void {
    this.slotMode = mode;
    this.selectedBuild = null;
  }

  /** Tab key or click; a second one on the send tab turns its page. */
  private pickMode(mode: SlotMode): void {
    if (mode === 'send' && this.mode === 'send') this.nextSendPage();
    else this.setSlotMode(mode);
  }

  /** A command card slot arms a fighter for placement, sends a merc or buys an upgrade, depending on the slot mode. */
  private slotKey(i: number): void {
    if (this.mode === 'king') {
      const what = KING_SLOTS[i];
      if (what === 'worker') this.buyWorker();
      else if (what === 'farm') this.upgradeFarm();
      else if (what) this.upgradeKing(what);
    } else if (this.mode === 'send') {
      const merc = this.sends()[this.sendPage * SEND_PAGE_SIZE + i];
      if (merc) this.feedback(this.session.send({ type: 'sendMerc', merc: merc.id }), `${merc.name.toUpperCase()} SENT!`, 'build');
    } else if (i === REROLL_SLOT && this.isProphet()) {
      this.selectedBuild = null;
      this.feedback(this.session.send({ type: 'reroll' }), 'NEW FIGHTERS!', 'magic');
    } else if (i < this.fighters().length) {
      if (this.session.game.phase !== 'build') return this.ui.floatText('BUILD AFTER WAVE', 0xff6060);
      this.selectedBuild = this.selectedBuild === i ? null : i;
      this.selectedUnit = null;
      if (this.viewArea !== this.me) this.setView(this.me);
    }
  }

  private sends() {
    const g = this.session.game;
    return Object.values(g.data.mercs).map((m) => ({ ...m, name: g.data.units[m.unit]!.name }));
  }

  private nextSendPage(): void {
    this.sendPage = (this.sendPage + 1) % Math.ceil(this.sends().length / SEND_PAGE_SIZE);
  }

  private buyWorker(): void {
    this.feedback(this.session.send({ type: 'buyWorker' }), 'WISP +1');
  }

  private upgradeFarm(): void {
    this.feedback(this.session.send({ type: 'upgradeFarm' }), 'FARM UP!');
  }

  private upgradeKing(stat: KingStat): void {
    this.feedback(this.session.send({ type: 'upgradeKing', stat }), `KING ${stat.toUpperCase()} UP!`);
  }

  private upgradeSelected(target?: string): void {
    const u = this.selectedUnit !== null ? this.session.game.units.get(this.selectedUnit) : undefined;
    if (!u || u.kind !== 'fighter' || u.owner !== this.me) return;
    const to = target ?? this.session.game.def(u).upgradesTo?.[0];
    if (to) this.feedback(this.session.send({ type: 'upgrade', unitId: u.id, to }), 'UPGRADED!');
  }

  private sellSelected(): void {
    const u = this.selectedUnit !== null ? this.session.game.units.get(this.selectedUnit) : undefined;
    if (!u || u.kind !== 'fighter' || u.owner !== this.me) return;
    this.feedback(this.session.send({ type: 'sell', unitId: u.id }), undefined, 'sell');
    this.selectedUnit = null;
  }

  private feedback(result: { ok: boolean; error?: string }, okText?: string, okSound: SoundKey = 'upgrade'): void {
    sfx(this, result.ok ? okSound : 'error');
    if (!result.ok) this.ui.floatText((result.error ?? 'error').toUpperCase(), 0xff6060);
    else if (okText) this.ui.floatText(okText, 0xfff080);
  }

  /** Grid cell under a field-pixel position on the local player's lane. */
  private cellAt(fx: number, fy: number): { col: number; row: number } | null {
    const lane = this.map.slot(this.me);
    const col = Math.floor(((fx - lane.x) / SCALE - LANE.gridX) / CELL);
    const row = Math.floor((fy - lane.y) / SCALE / CELL);
    return col >= 0 && row >= 0 && col < LANE.gridCols && row < LANE.gridRows ? { col, row } : null;
  }

  private fighterAt(col: number, row: number): UnitState | undefined {
    for (const u of this.session.game.units.values()) {
      if (u.kind === 'fighter' && u.owner === this.me && u.cell?.col === col && u.cell.row === row) return u;
    }
    return undefined;
  }

  /** The visible unit whose sprite covers a field-pixel position, if any. */
  private unitAt(fx: number, fy: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [id, view] of this.views) {
      const u = this.session.game.units.get(id);
      if (!u || !this.shown.has(u.area) || u.dead) continue;
      const b = view.sprite.getBounds();
      if (!b.contains(fx, fy)) continue;
      const d = Math.hypot(b.centerX - fx, b.centerY - fy);
      if (d < bestDist) {
        best = id;
        bestDist = d;
      }
    }
    return best;
  }

  private fighters(): string[] {
    return this.session.game.players[this.me]!.fighters;
  }

  private isProphet(): boolean {
    const g = this.session.game;
    return !!g.data.builders[g.players[this.me]!.builder]?.random;
  }

  /** Glides the map to an area. */
  private setView(area: number): void {
    this.targetY = this.focusY(this.map.slot(area));
    this.manualCamUntil = 0;
    if (this.session.game.isLane(area)) this.camX = this.autoCameraX(area);
  }

  /** Solo: same setup once more; online games go back to the menu. */
  private playAgain(): void {
    if (!this.solo) return this.toMenu();
    this.scene.stop('ui');
    this.scene.restart({ solo: this.solo });
  }

  private toMenu(): void {
    if (this.session.online) {
      void (this.session as NetSession).room.leave();
      clearRejoin();
      history.replaceState(null, '', location.pathname);
    }
    this.scene.stop('ui');
    this.scene.start('title');
  }

  /** World units in an area -> field pixels on the map. */
  private toField(area: number, x: number, y: number): { x: number; y: number } {
    return this.map.toField(area, x, y);
  }

  // ---- unit views -------------------------------------------------------------

  private syncUnits(): void {
    const game = this.session.game;
    this.hpBars.clear();
    const pair = this.targetPair();
    for (const [id, view] of this.views) {
      // Gone units drop their view; upgraded ones rebuild it for the new sprite and auras.
      const u = game.units.get(id);
      if (!u || u.def !== view.def) this.destroyView(id, view);
    }
    for (const u of game.units.values()) {
      const view = this.views.get(u.id) ?? this.createView(u);
      const visible = this.shown.has(u.area);
      view.sprite.setVisible(visible);
      view.shadow.setVisible(visible && !u.dead);
      view.ring?.setVisible(visible && !u.dead);
      view.ownerRing?.setVisible(visible && !u.dead);
      if (!visible) continue;
      const pos = this.session.interpolated(u.id)!;
      const s = this.toField(u.area, pos.x, pos.y);
      // Jumps (back to the grid after a wave, warps) are no walking: they keep the facing and speed.
      const dx = Math.abs(s.x - view.lastX) > TELEPORT_PX ? 0 : s.x - view.lastX;
      if (Math.abs(dx) > 0.05) view.facingRight = dx > 0;
      view.speed += (Math.abs(dx) - view.speed) * 0.3;
      const moving = view.speed > 0.1;
      if (moving && game.phase === 'fight') view.fought = true;
      // Idle fighters turn back towards the incoming creeps (in the arena the west army faces east);
      // until they have fought this wave they look down at the player instead.
      const idle = u.kind === 'fighter' && game.phase !== 'arena' && view.speed < 0.05 && this.time.now >= view.attackUntil;
      if (idle) view.facingRight = false;
      view.faceDown = idle && !view.fought;
      view.lastX = s.x;
      const { lunge, squash, hop } = view.recoil;
      view.sprite
        .setPosition(Math.round(s.x + lunge), Math.round(s.y + hop))
        .setScale(view.scale * (2 - squash), view.scale * squash)
        .setDepth(this.unitDepth(u, view, s.y));
      view.shadow.setPosition(Math.round(s.x + lunge), Math.round(s.y) + 1).setDepth(9 + s.y);
      view.ring?.setPosition(Math.round(s.x + lunge), Math.round(s.y)).setDepth(8 + s.y);
      view.ownerRing?.setPosition(Math.round(s.x + lunge), Math.round(s.y)).setDepth(8.5 + s.y);
      this.animate(u, view, moving);
      if (this.time.now > view.flashUntil) {
        // The marked target goes reddish; debuffs tint the unit: stunned grey, poisoned green, slowed blue.
        const tint = u === pair?.[1] ? TARGET_TINT : u.status & STATUS.stunned ? 0x9898a8 : u.status & STATUS.poisoned ? 0x98ff98 : u.status & STATUS.slowed ? 0x98b8ff : 0xffffff;
        view.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(tint);
      }
      this.drawHpBar(u, view, s.x, s.y);
    }
    this.drawSelection();
    if (pair) this.drawTarget(pair[0], pair[1]);
  }

  /** The selected (else the hovered) unit and what it is attacking, both alive and on screen. */
  private targetPair(): [UnitState, UnitState] | null {
    const game = this.session.game;
    const id = this.selectedUnit ?? this.hoverUnit;
    const u = id !== null ? game.units.get(id) : undefined;
    const t = u && u.targetId !== null ? game.units.get(u.targetId) : undefined;
    return u && t && !u.dead && !t.dead && this.shown.has(u.area) && t.area === u.area ? [u, t] : null;
  }

  /** A dashed line from attacker to target and a ring at the target's feet (the target is also tinted). */
  private drawTarget(u: UnitState, t: UnitState): void {
    const from = this.views.get(u.id)?.shadow;
    const to = this.views.get(t.id);
    if (!from || !to) return;
    // Chest to chest, so the line doesn't run along the ground under the crowd.
    const ax = from.x;
    const ay = from.y - 6;
    const bx = to.shadow.x;
    const by = to.shadow.y - 6;
    const len = Math.hypot(bx - ax, by - ay);
    const g = this.hpBars.lineStyle(1, TARGET_COLOR, 0.85);
    for (let d = 0; d < len; d += 5) {
      const k0 = d / len;
      const k1 = Math.min(1, (d + 3) / len);
      g.lineBetween(ax + (bx - ax) * k0, ay + (by - ay) * k0, ax + (bx - ax) * k1, ay + (by - ay) * k1);
    }
    const w = t.kind === 'king' ? 32 : 16 * to.scale;
    g.strokeEllipse(to.shadow.x, to.shadow.y - 1, w, w * 0.4).strokeEllipse(to.shadow.x, to.shadow.y - 1, w + 2, w * 0.4 + 2);
  }

  /** Ring at the feet and an arrow over the head of the selected unit, wherever it walks. */
  private drawSelection(): void {
    const u = this.selectedUnit !== null ? this.session.game.units.get(this.selectedUnit) : undefined;
    const view = u ? this.views.get(u.id) : undefined;
    const shown = !!u && !!view && !u.dead && this.shown.has(u.area);
    this.selRing.setVisible(shown);
    this.selArrow.setVisible(shown);
    if (!shown) return;
    const x = view.shadow.x;
    const y = view.shadow.y - 1;
    const w = u.kind === 'king' ? 32 : 18 * view.scale;
    this.selRing.setPosition(x, y).setSize(w, w * 0.38).setDepth(view.shadow.depth + 0.6);
    const head = view.sprite.getBounds().top;
    this.selArrow.setPosition(x, Math.round(head - 2 + Math.sin(this.time.now / 150) * 1.5));
  }

  private createView(u: UnitState): UnitView {
    const king = u.kind === 'king';
    const spec = UNIT_SPRITES[u.def];
    const key = king ? `${KING_SPRITES[u.team]}-Idle` : spec ? `${spriteKey(spec)}-Walk` : '__WHITE';
    const scale = (spec?.scale ?? 1) * (u.kind === 'creep' || u.kind === 'merc' ? ATTACKER_SCALE : 1);
    const sprite = this.add.sprite(0, 0, key).setOrigin(0.5, king ? 0.9 : 1).setScale(scale);
    if (king) sprite.play(`${KING_SPRITES[u.team]}-idle`);
    const shadow = this.add.image(0, 0, ellipseTexture(this, king ? 28 : 12 * scale, king ? 8 : 4 * scale, 0.35)).setTint(0x000000);
    // Fighters and sends wear their owner's colour at the feet: gold for your own, else the team colour.
    const owned = u.kind === 'fighter' || u.kind === 'merc';
    const color = seatColor(this.session.game, u.owner, this.me);
    const ownerRing = owned ? this.add.image(0, 0, ellipseTexture(this, 14 * scale, 5 * scale, 0.3, 0.9)).setTint(color) : undefined;
    // Aura carriers get a pulsing ring at their feet in the colour of what the aura does.
    const aura = this.session.game.def(u).abilities?.find((a) => a.kind === 'aura');
    let ring: Phaser.GameObjects.Image | undefined;
    if (aura?.kind === 'aura') {
      ring = this.add
        .image(0, 0, ellipseTexture(this, 26 * scale, 9 * scale, 0.45))
        .setTint(aura.enemies ? 0xb050ff : AURA_GLOW[aura.stat])
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ring, alpha: 0.12, scaleX: 1.25, scaleY: 1.25, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // Fighters face the incoming creeps (left), attackers face the king (right).
    const view = { sprite, shadow, ring, ownerRing, def: u.def, lastX: this.toField(u.area, u.x, u.y).x, speed: 0, attackUntil: 0, facingRight: u.kind !== 'fighter', faceDown: u.kind === 'fighter', fought: false, flashUntil: 0, scale, recoil: { lunge: 0, squash: 1, hop: 0 } };
    this.views.set(u.id, view);
    return view;
  }

  /** Fighters step in front of the crowd while they strike, so a swarmed tank's attacks stay visible. */
  private unitDepth(u: UnitState, view: UnitView, y: number): number {
    return 10 + y + (u.kind === 'fighter' && this.time.now < view.attackUntil ? 500 : 0);
  }

  private destroyView(id: number, view: UnitView): void {
    view.sprite.destroy();
    view.shadow.destroy();
    view.ring?.destroy();
    view.ownerRing?.destroy();
    this.views.delete(id);
  }

  private animate(u: UnitState, view: UnitView, moving: boolean): void {
    if (u.kind === 'king') return;
    const spec = UNIT_SPRITES[u.def];
    if (!spec) return;
    const sprite = view.sprite;
    // Character sheets face left, monster sheets face right; the down column is never flipped.
    sprite.setFlipX(!view.faceDown && (spec.kind === 'character' ? view.facingRight : !view.facingRight));
    const attacking = this.time.now < view.attackUntil;
    if (spec.kind === 'monster') {
      sprite.setAlpha(u.dead ? 0.4 : 1);
      const walk = `${spriteKey(spec)}-walk${view.faceDown ? '-down' : ''}`;
      if (sprite.anims.currentAnim?.key !== walk) sprite.play(walk);
      // No attack frames: the walk cycle runs fast while biting.
      sprite.anims.timeScale = attacking ? 3 : 1;
      return;
    }
    if (u.dead) {
      sprite.anims.stop();
      sprite.setTexture(`${spriteKey(spec)}-Dead`, 0).setAlpha(0.6);
    } else if (moving && !attacking) {
      sprite.setAlpha(1);
      if (sprite.anims.currentAnim?.key !== `${spriteKey(spec)}-walk`) sprite.play(`${spriteKey(spec)}-walk`);
    } else {
      const pose = `${spriteKey(spec)}-${attacking ? 'Attack' : 'Idle'}`;
      const frame = view.faceDown && !attacking ? DIR.down : DIR.left;
      if (sprite.texture.key !== pose || String(sprite.frame.name) !== String(frame)) {
        sprite.anims.stop();
        sprite.setAlpha(1).setTexture(pose, frame);
      }
    }
  }

  private drawHpBar(u: UnitState, view: UnitView, x: number, y: number): void {
    const g = this.hpBars;
    // Creeps and sends always show their HP; own fighters only once hurt.
    const attacker = u.kind === 'creep' || u.kind === 'merc';
    if (u.dead || u.kind === 'king' || (!attacker && u.hp >= u.maxHp)) return;
    const w = Math.round(12 * view.scale);
    const top = Math.round(y) - Math.round(16 * view.scale) - 3;
    g.fillStyle(0x000000, 0.8).fillRect(Math.round(x) - w / 2 - 1, top - 1, w + 2, 3);
    const ratio = Math.max(0, u.hp / u.maxHp);
    g.fillStyle(ratio > 0.5 ? 0x60e060 : ratio > 0.25 ? 0xe0c040 : 0xe04040, 1).fillRect(Math.round(x) - w / 2, top, Math.ceil(w * ratio), 1);
  }

  // ---- events & effects ---------------------------------------------------------

  private handleEvent(ev: GameEvent): void {
    const game = this.session.game;
    switch (ev.type) {
      case 'attack': {
        // The target may already be gone (killing blow), so aim at the position the event carries.
        const a = game.units.get(ev.unitId);
        if (!a || !this.shown.has(a.area)) return;
        // Aim from and at where the sprites are drawn, not the raw sim positions.
        const src = this.session.interpolated(a.id) ?? a;
        const target = game.units.get(ev.targetId);
        const dst = (target?.area === a.area && this.session.interpolated(target.id)) || ev;
        const from = this.toField(a.area, src.x, src.y);
        const to = this.toField(a.area, dst.x, dst.y);
        const view = this.views.get(a.id);
        if (!view) return;
        const dir = to.x >= from.x ? 1 : -1;
        view.facingRight = dir > 0;
        view.fought = true;
        view.faceDown = false;
        if (a.kind === 'king') {
          view.sprite.play(`${KING_SPRITES[a.team]}-attack`).chain(`${KING_SPRITES[a.team]}-idle`);
          this.playFx('explosion', to.x, to.y - 6);
          sfx(this, 'explosion');
          this.shake(80, 0.004);
          return;
        }
        const def = game.def(a);
        const ranged = def.attack.range > MELEE_RANGE;
        const spec = UNIT_SPRITES[a.def];
        const character = spec?.kind === 'character';
        const lunge = bodyMotion(this, view.recoil, dir, ranged, !character);
        // animate() holds the pose (characters) or the fast bite cycle (monsters) until then.
        view.attackUntil = this.time.now + 220;
        if (character) {
          // Attack pose plus a visible weapon, since the sheets have a single attack frame.
          const weapon = weaponFor(def);
          if (weapon) weaponSwing(this, this.trails, weapon, Math.round(from.x + lunge), Math.round(from.y), dir, this.unitDepth(a, view, from.y) + 1);
        }
        // Fighters hit in their builder's style; creeps and sends keep the small marks so a swarm
        // doesn't bury what it is chewing on.
        const { impact, ...shot } = attackStyle(game.data, def);
        sfx(this, ranged ? SHOT_SOUND[shot.shot ?? 'arrow'] : (FX_SOUND[impact ?? 'cut'] ?? 'hit'));
        if (!ranged) this.playFx(impact ?? 'cut', to.x, to.y - 6);
        else {
          // The sim deals the damage when the shot lands, so fly for exactly that long.
          const area = a.area;
          const aim = () => {
            const p = game.units.get(ev.targetId)?.area === area ? this.session.interpolated(ev.targetId) : null;
            const q = p ? this.toField(area, p.x, p.y) : to;
            return { x: q.x, y: q.y - 6 };
          };
          projectile(this, shot, from.x + 6 * dir, from.y - 8, aim, ev.flightMs, impact && ((x, y) => this.playFx(impact, x, y, 0.7)));
        }
        return;
      }
      case 'damage': {
        const t = game.units.get(ev.targetId);
        const view = this.views.get(ev.targetId);
        if (!t || !view || !this.shown.has(t.area)) return;
        const at = { x: t.x, y: t.y };
        const area = t.area;
        // Own units flash red when hit, everything else white. Digits only for hits by own units, so a
        // crowded lane shows what your fighters deal (showcase clips keep them all).
        const flash = t.owner === this.me ? HURT_FLASH : 0xffffff;
        const digits = SHOWCASE || game.units.get(ev.sourceId)?.owner === this.me;
        // Flash at most every few frames: a swarmed unit would otherwise stay a white blob.
        if (this.time.now > view.flashUntil + FLASH_GAP_MS) {
          view.sprite.setTint(flash).setTintMode(Phaser.TintModes.FILL);
          view.flashUntil = this.time.now + 70;
        }
        if (!digits) return;
        const p = this.session.interpolated(ev.targetId) ?? at;
        const s = this.toField(area, p.x, p.y);
        this.damageNumber(s.x, s.y - 18, Math.round(ev.amount));
        return;
      }
      case 'death': {
        if (!this.shown.has(ev.area)) return;
        sfx(this, 'death');
        // Bounty for the local player's kills (mirrors the sim: fighter kills only, nothing in the finale).
        // Killed attackers are already gone from the state; their view (and def) lives until the next sync.
        const killer = ev.killerId !== null ? game.units.get(ev.killerId) : undefined;
        const def = game.data.units[this.views.get(ev.unitId)?.def ?? ''];
        const bounty = game.data.waves[game.wave - 1]?.endless ? 0 : def?.bounty ?? 0;
        if (killer?.kind === 'fighter' && killer.owner === this.me && bounty > 0) {
          const at = this.toField(ev.area, ev.x, ev.y);
          this.goldPop(at.x, at.y - 20, bounty);
          sfx(this, 'coin');
        }
        const u = game.units.get(ev.unitId);
        if (!u) return;
        const s = this.toField(u.area, u.x, u.y);
        this.playFx('smoke', s.x, s.y - 8);
        return;
      }
      case 'leak':
        if (ev.player === this.me) {
          this.shake(120, 0.006);
          sfx(this, 'leak');
          this.ui.floatText('LEAK!', 0xff5050, VIEW_W - 60, FIELD_TOP + 14);
        }
        return;
      case 'phase': {
        // Each build phase starts on the fighters, each wave on the sends.
        if (ev.phase === 'build') {
          this.slotMode = 'build';
          for (const view of this.views.values()) view.fought = false;
        }
        if (ev.phase === 'fight') {
          this.slotMode = 'send';
          this.selectedBuild = null;
          this.soloReport?.wave();
        }
        const prev = this.lastPhase;
        this.lastPhase = ev.phase;
        if (ev.phase === 'arena') {
          this.ui.showBanner(['ARENA BATTLE!', 'ALL ARMIES CLASH'], 2000);
          // Showcase clips stay on their lane.
          if (!SHOWCASE) this.setView(game.battleArena());
          return;
        }
        if (ev.phase === 'build' && prev !== 'fight') return; // after the arena: its own banner said it all
        if (ev.phase === 'fight') {
          this.leaksAtWaveStart = game.players.map((p) => p.leaks);
          sfx(this, 'wave');
          const wave = game.data.waves[ev.wave - 1]!;
          this.ui.showBanner([`WAVE ${ev.wave}`, `${wave.count}X ${game.data.units[wave.creep]!.name.toUpperCase()}`]);
        } else {
          // Wave summary in a corner: how every lane held, you in gold, the rest in their team colour.
          const width = Math.max(...game.players.map((p) => (p.index === this.me ? 3 : p.name.length)));
          const rows = game.players.map((p, i) => {
            const leaks = p.leaks - (this.leaksAtWaveStart[i] ?? 0);
            const name = (p.index === this.me ? 'YOU' : p.name.toUpperCase()).padEnd(width + 1);
            return { text: `${name}${leaks ? `${leaks} LEAKS` : 'CLEAN'}`, color: seatColor(game, p.index, this.me) };
          });
          this.ui.showSummary([{ text: `WAVE ${ev.wave - 1} CLEARED`, color: 0xfff080 }, ...rows]);
          // After a boss wave this build phase ends in the arena battle.
          const rules = game.data.rules;
          if (rules.arenaWaves.includes(ev.wave - 1)) this.ui.showBanner([`ARENA BATTLE IN ${Math.round(rules.arenaBuildMs / 1000)}S`, 'BUILD UP FOR IT!'], 2500);
        }
        return;
      }
      case 'effect': {
        if (!this.shown.has(ev.area)) return;
        const s = this.toField(ev.area, ev.x, ev.y);
        if (ev.effect === 'crit') {
          this.playFx('cutx', s.x, s.y - 8);
          sfx(this, 'slash', 1.5);
          this.fieldText(s.x, s.y - 26, 'CRIT!', 0xffe040);
        } else if (ev.effect === 'stun') {
          this.playFx('thunder', s.x, s.y - 14);
          sfx(this, 'stun');
          this.fieldText(s.x, s.y - 26, 'STUN', 0x98b8ff);
        } else if (ev.effect === 'heal') {
          this.playFx('boost', s.x, s.y - 10);
          sfx(this, 'heal');
          this.fieldText(s.x, s.y - 20, `+${ev.amount}`, 0x70ff90);
        } else if (ev.effect === 'nova') {
          this.novaFx(ev.unitId, s.x, s.y);
          sfx(this, 'nova');
        } else {
          this.playFx('explosion', s.x, s.y - 6, 0.6);
          sfx(this, 'explosion', 0.7);
        }
        return;
      }
      case 'arenaEnd': {
        const myTeam = game.players[this.me]!.team;
        const title = ev.winner === null ? 'ARENA: DRAW' : ev.winner === myTeam ? 'ARENA WON!' : 'ARENA LOST';
        this.ui.showBanner([title, ev.winner === myTeam || ev.winner === null ? `+${ev.gold} GOLD` : 'BETTER LUCK NEXT TIME'], 2600);
        this.time.delayedCall(1200, () => this.setView(this.me));
        return;
      }
      case 'gameOver':
        this.soloReport?.end(ev.winner, false);
        this.showGameOver(ev.winner);
        return;
      default:
        return;
    }
  }

  /** Area blast: a burst on the caster and a staggered ring of the ability's element around it. */
  private novaFx(unitId: number, x: number, y: number): void {
    const game = this.session.game;
    const u = game.units.get(unitId);
    if (!u) return;
    const nova = [...(game.def(u).abilities ?? []), ...u.granted].find((a) => a.kind === 'nova');
    const key: FxKey = (nova && NOVA_FX[nova.name]) ?? (u.kind === 'king' ? 'rockspike' : NOVA_FX_BY_TYPE[game.def(u).attack.type]);
    const radius = (nova?.kind === 'nova' ? nova.radius : 300) * SCALE;
    this.playFx(key, x, y - 10, 1.5);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      // The field is seen from the side: squash the ring vertically.
      this.time.delayedCall(40 * i, () => this.playFx(key, x + Math.cos(angle) * radius * 0.8, y - 8 + Math.sin(angle) * radius * 0.4));
    }
    this.shake(140, 0.004);
  }

  /** Camera shake, unless turned off in the options. */
  private shake(durationMs: number, intensity: number): void {
    if (settings().shake) this.cameras.main.shake(durationMs, intensity);
  }

  private playFx(key: FxKey, x: number, y: number, scale = 1): void {
    const fx = this.add.sprite(Math.round(x), Math.round(y), `fx-${key}`).setDepth(10000).setScale(scale);
    // Light effects glow additively; solid ones (smoke, rock, water, ice) would wash out into white blobs.
    // Glowing ones draw one layer up so each blend mode stays one batch.
    if (GLOW_FX.has(key)) fx.setBlendMode(Phaser.BlendModes.ADD).setDepth(10000.5);
    fx.play(`fx-${key}`).once('animationcomplete', () => fx.destroy());
  }

  /** Short coloured text rising from a unit (crit, heal, stun). */
  private fieldText(x: number, y: number, text: string, color: number): void {
    const t = this.add.bitmapText(Math.round(x), Math.round(y), FONT, text).setOrigin(0.5, 1).setTint(color).setDepth(10002);
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  /** "+N" with a coin rising from a creep the local player killed. */
  private goldPop(x: number, y: number, amount: number): void {
    const text = `+${amount}`;
    const left = Math.round(x - (text.length * 8 + 8) / 2);
    const coin = this.add.image(left, 0, 'icon-coin').setOrigin(0, 1);
    const label = this.add.bitmapText(left + 8, 1, FONT, text).setOrigin(0, 1).setTint(0xffe040);
    const c = this.add.container(0, Math.round(y), [coin, label]).setDepth(10003);
    this.tweens.add({ targets: c, y: y - 12, alpha: 0, duration: 900, delay: 150, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
  }

  /** FF6-style damage digits: pop up, bounce, then fade. */
  private damageNumber(x: number, y: number, amount: number): void {
    const t = this.add.bitmapText(Math.round(x), Math.round(y), FONT, String(amount)).setOrigin(0.5, 1).setDepth(10001);
    this.tweens.chain({
      targets: t,
      tweens: [
        { y: y - 8, duration: 120, ease: 'Quad.easeOut' },
        { y: y - 4, duration: 140, ease: 'Bounce.easeOut' },
        { alpha: 0, duration: 250, delay: 200 },
      ],
      onComplete: () => t.destroy(),
    });
  }

  /** End screen: result, why it happened and a per-player summary. */
  private showGameOver(winner: TeamId | null): void {
    const game = this.session.game;
    const me = game.players[this.me]!;
    const title = winner === null ? 'DRAW' : winner === me.team ? 'VICTORY!' : 'DEFEAT...';
    sfx(this, winner === me.team ? 'win' : 'lose');
    const fallen = ([0, 1] as const).find((t) => game.king(t).hp <= 0);
    const reason = fallen === undefined ? 'ALL WAVES SURVIVED' : `${fallen === me.team ? 'YOUR' : 'FOE'} KING FELL IN WAVE ${game.wave}`;
    const rows = game.players.map((p) => {
      const value = [...game.units.values()].filter((u) => u.kind === 'fighter' && u.owner === p.index).reduce((n, u) => n + u.invested, 0);
      const name = (p.index === this.me ? 'YOU' : p.name.toUpperCase()).padEnd(5);
      return `${name}${game.data.builders[p.builder]!.name.toUpperCase().padEnd(10)}LEAKS ${String(p.leaks).padStart(3)}  VALUE ${value}`;
    });
    const keys = TOUCH ? [] : ['', this.solo ? 'R: PLAY AGAIN   ESC: MENU' : 'ESC: MENU'];
    const bottom = this.ui.showBanner([title, reason, '', ...rows, ...keys], 0);
    const again = this.solo ? [{ label: 'PLAY AGAIN', action: () => this.playAgain() }] : [];
    this.ui.showChoices(bottom + 4, [...again, { label: 'MENU', action: () => this.toMenu() }]);
  }

  // ---- grid ------------------------------------------------------------------

  private drawGrid(): void {
    const g = this.grid;
    g.clear();
    this.ghost.setVisible(false);
    const game = this.session.game;
    const build = game.phase === 'build';
    const cs = CELL * SCALE;
    const gridX = (slot: MapSlot) => slot.x + LANE.gridX * SCALE;
    const mine = this.map.slot(this.me);
    const ownShown = this.shown.has(this.me);
    this.youMark.setVisible(ownShown && build && !SHOWCASE);
    for (const slot of this.map.slots) {
      if (slot.kind !== 'lane' || !this.shown.has(slot.area)) continue;
      const own = slot === mine;
      const x0 = gridX(slot);
      const y0 = slot.y;
      // While building, the own grid is framed in the player's gold with a bobbing "YOU" above it.
      if (own && build) {
        this.youMark.setPosition(x0 + (LANE.gridCols * cs) / 2, Math.round(y0 - 1 + Math.sin(this.time.now / 200)));
        g.lineStyle(1, ME_COLOR, 0.7).strokeRect(x0, y0, LANE.gridCols * cs, LANE.gridRows * cs);
      }
      g.lineStyle(1, 0xffffff, own && build ? 0.22 : 0.08);
      for (let c = 0; c <= LANE.gridCols; c++) g.lineBetween(x0 + c * cs, y0, x0 + c * cs, y0 + LANE.gridRows * cs);
      for (let r = 0; r <= LANE.gridRows; r++) g.lineBetween(x0, y0 + r * cs, x0 + LANE.gridCols * cs, y0 + r * cs);
      // Leak line.
      g.fillStyle(0xc03030, 0.5).fillRect(slot.x + LANE.leakX * SCALE, y0, 2, slot.h);
    }
    const sel = this.selectedUnit !== null ? game.units.get(this.selectedUnit) : undefined;
    if (sel?.cell && game.isLane(sel.area) && this.shown.has(sel.area)) {
      const slot = this.map.slot(sel.area);
      g.lineStyle(1, 0xfff060, 1).strokeRect(gridX(slot) + sel.cell.col * cs, slot.y + sel.cell.row * cs, cs, cs);
    }
    if (!ownShown || !this.hoverCell) return;
    const x0 = gridX(mine);
    const y0 = mine.y;
    const { col, row } = this.hoverCell;
    const unit = this.selectedBuild !== null ? this.fighters()[this.selectedBuild] : undefined;
    if (!unit) {
      if (this.fighterAt(col, row)) g.fillStyle(0xffffff, 0.2).fillRect(x0 + col * cs, y0 + row * cs, cs, cs);
      return;
    }
    // Placement preview: ghost of the armed fighter, red when the spot or gold says no.
    const blocked = !!this.fighterAt(col, row) || game.players[this.me]!.gold < (game.data.units[unit]?.goldCost ?? 0) || !build;
    g.fillStyle(blocked ? 0xff4040 : 0xffffff, 0.3).fillRect(x0 + col * cs, y0 + row * cs, cs, cs);
    const spec = UNIT_SPRITES[unit];
    if (spec) {
      const key = spec.kind === 'character' ? `${spriteKey(spec)}-Idle` : `${spriteKey(spec)}-Walk`;
      this.ghost
        .setTexture(key, DIR.down) // both sheet kinds have a down-facing column
        .setPosition(x0 + col * cs + cs / 2, y0 + (row + 1) * cs)
        .setTint(blocked ? 0xff6060 : 0xffffff)
        .setVisible(true);
    }
  }
}

/** Dev deep link: `?builder=grove&size=2&mode=ar` (ap, ar, sd, apr) starts a solo game directly. */
function soloFromUrl(): SoloConfig {
  const params = new URLSearchParams(location.search);
  const builders = Object.keys(LEGION_DATA.builders);
  const wanted = params.get('builder');
  const mode = params.get('mode') as ModeId;
  return {
    builder: wanted && builders.includes(wanted) ? wanted : builders[0]!,
    teamSize: Math.min(4, Math.max(1, Number(params.get('size')) || 1)),
    mode: MODE_IDS.includes(mode) ? mode : 'ap',
    foe: params.get('vs') && builders.includes(params.get('vs')!) ? params.get('vs')! : undefined,
  };
}
