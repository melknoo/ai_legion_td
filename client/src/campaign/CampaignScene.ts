import Phaser from 'phaser';
import {
  AFFIXES,
  LEGION_DATA as D,
  MAP_ROWS,
  MELEE_RANGE,
  RELICS,
  REST_HEAL,
  ROSTER_CAP,
  SHOP_HEAL,
  SKIP_LUMBER,
  campaignBuilders,
  chooseReward,
  currentNode,
  describeAbility,
  enterNode,
  fighterTier,
  kingMax,
  leaveShop,
  newRun,
  nodeWaves,
  reachable,
  rest,
  shopBuy,
  type MapNode,
  type RunState,
  type ShopOffer,
} from '@legion/shared';
import { sfx } from '../audio/sfx.ts';
import { builderPortrait } from '../assets/manifest.ts';
import { VIEW_H, VIEW_W, layoutCamera } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { addSky } from '../scenes/TitleScene.ts';
import { ff6Window, panelTexture } from '../ui/ff6Window.ts';
import { facesetKey } from '../ui/Hud.ts';
import { onKey } from '../ui/keys.ts';
import { TextButton } from '../ui/TextButton.ts';
import { TOUCH, bindPress } from '../ui/touch.ts';
import { ARMOR_INFO, ATTACK_INFO } from '../ui/typeInfo.ts';
import { clearRun, loadRun, saveRun } from './save.ts';

const GOLD = 0xfff080;
const DIM = 0xc0c8f0;
const BAD = 0xff7070;
const OVERLAY_DEPTH = 1000;
const KEYS = ['LEFT', 'RIGHT', 'UP', 'DOWN', 'ENTER', 'SPACE', 'ESC', 'ONE', 'TWO', 'THREE', 'FOUR', 'S'] as const;
type Key = (typeof KEYS)[number];

/** Map window and node layout (layout pixels). */
const MAP = { x: 2, y: 26, w: 300, h: 242 };
const SIDE = { x: 306, y: 26, w: 172, h: 242 };
const NODE = 26;

const NODE_NAME: Record<MapNode['kind'], string> = { battle: 'BATTLE', elite: 'ELITE', boss: 'BOSS', shop: 'SHOP', rest: 'REST', treasure: 'TREASURE' };

/** Dev aid: `?campaign&builder=x&seed=n` starts a run at once (only for the first visit). */
let devStartUsed = false;

interface MenuItem {
  label: string;
  action: () => void;
}

/** Words to lines of at most `width` characters. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const upper = (s: string, max = 99) => s.toUpperCase().slice(0, max);
const builderOf = (fighter: string) => Object.values(D.builders).find((b) => !b.random && b.fighters.includes(fighter));

/**
 * The campaign between battles: start (continue / new run), builder choice, the act map, and the
 * reward, shop, rest and end overlays. Every run change is saved at once; battles run in BattleScene
 * and come back here with the updated run.
 */
export class CampaignScene extends Phaser.Scene {
  private run: RunState | null = null;
  /** Objects of the current view, destroyed on every redraw. */
  private parts: { destroy(): void }[] = [];
  private keys: Partial<Record<Key, () => void>> = {};
  private menu: { lines: Phaser.GameObjects.BitmapText[]; items: MenuItem[]; index: number } | null = null;
  private hand!: Phaser.GameObjects.Image;
  private builderIndex = 0;
  private readonly builders = campaignBuilders(D);
  /** Map: which reachable node the keyboard points at. */
  private focus = 0;
  /** Reward/shop/rest cards: which one the keyboard points at. */
  private cardFocus = 0;
  /** Side panel text, set by hovering nodes, faces and relics. */
  private info: Phaser.GameObjects.BitmapText | null = null;
  /** Pulsing reachable nodes; stopped before their icons are destroyed. */
  private pulses: Phaser.Tweens.Tween[] = [];

  constructor() {
    super('campaign');
  }

  init(data?: { run?: RunState }): void {
    this.run = data?.run ?? null;
  }

  create(): void {
    layoutCamera(this);
    addSky(this);
    this.parts = [];
    this.pulses = [];
    this.hand = this.add.image(0, 0, 'icon-hand').setOrigin(1, 0.5).setDepth(OVERLAY_DEPTH + 10).setVisible(false);
    this.tweens.add({ targets: this.hand, x: '-=2', duration: 300, yoyo: true, repeat: -1 });
    const kb = this.input.keyboard!;
    for (const k of KEYS) onKey(kb, `keydown-${k}`, () => this.keys[k]?.());
    if (this.run) {
      saveRun(this.run);
      return this.showRun();
    }
    const params = new URLSearchParams(location.search);
    const builder = params.get('builder');
    if (!devStartUsed && builder && this.builders.includes(builder)) {
      devStartUsed = true;
      return this.startRun(builder, Number(params.get('seed')) || undefined);
    }
    this.showStart();
  }

  override update(): void {
    const sel = this.menu?.lines[this.menu.index];
    this.hand.setVisible(!!sel);
    if (sel) this.hand.setPosition(sel.x - 3, sel.y + 4);
  }

  // ---- view plumbing --------------------------------------------------------

  private clear(): void {
    this.pulses.forEach((t) => t.remove());
    this.pulses = [];
    this.parts.forEach((p) => p.destroy());
    this.parts = [];
    this.keys = {};
    this.menu = null;
    this.info = null;
  }

  private keep<T extends { destroy(): void }>(o: T): T {
    this.parts.push(o);
    return o;
  }

  private text(x: number, y: number, s: string, color = 0xffffff, depth = 0): Phaser.GameObjects.BitmapText {
    return this.keep(this.add.bitmapText(x, y, FONT, s).setTint(color).setDepth(depth).setLineSpacing(3));
  }

  private window(x: number, y: number, w: number, h: number, depth = 0): void {
    this.keep(ff6Window(this, x, y, w, h).setDepth(depth));
  }

  private button(x: number, y: number, w: number, label: string, onClick: () => void, depth = 0): TextButton {
    return this.keep(new TextButton(this, x, y, w, label, onClick).setDepth(depth));
  }

  /** Vertical menu with the hand cursor (keys: up/down, Enter/Space). */
  private listMenu(x: number, y: number, w: number, items: MenuItem[]): void {
    this.window(x, y, w, items.length * 14 + 12);
    const lines = items.map((item, i) => {
      const t = this.text(x + 22, y + 8 + i * 14, item.label);
      const zone = this.keep(this.add.zone(x + 4, y + 5 + i * 14, w - 8, 14).setOrigin(0, 0).setInteractive({ useHandCursor: true }));
      zone.on('pointermove', () => this.menu && (this.menu.index = i));
      zone.on('pointerdown', () => item.action());
      return t;
    });
    this.menu = { lines, items, index: 0 };
    const move = (step: number) => this.menu && (this.menu.index = (this.menu.index + step + items.length) % items.length);
    this.keys.UP = () => move(-1);
    this.keys.DOWN = () => move(1);
    this.keys.ENTER = this.keys.SPACE = () => this.menu?.items[this.menu.index]?.action();
  }

  /** Blocks clicks to the view below an overlay. */
  private blocker(depth: number): void {
    const z = this.keep(this.add.zone(0, 0, VIEW_W, VIEW_H).setOrigin(0, 0).setInteractive().setDepth(depth));
    z.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
    this.keep(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000010, 0.55).setOrigin(0, 0).setDepth(depth));
  }

  private toTitle(): void {
    this.scene.start('title');
  }

  // ---- start and builder choice ---------------------------------------------

  private showStart(): void {
    this.clear();
    this.keep(this.add.bitmapText(VIEW_W / 2, 40, FONT, 'CAMPAIGN').setOrigin(0.5).setScale(3).setTint(0xffd060));
    this.keep(this.add.bitmapText(VIEW_W / 2, 66, FONT, 'ONE LANE. THE WAVES. NO WAY BACK.').setOrigin(0.5).setTint(0x9aa0d0));
    const saved = loadRun();
    const items: MenuItem[] = [];
    const ongoing = saved.run && saved.run.status !== 'won' && saved.run.status !== 'lost' ? saved.run : null;
    if (ongoing) {
      const node = currentNode(ongoing);
      const where = node ? `ROW ${node.row}` : 'START';
      items.push({ label: `CONTINUE: ${upper(D.builders[ongoing.builder]?.name ?? '?')}, ACT ${ongoing.act} ${where}`, action: () => this.resume(ongoing) });
    }
    items.push({ label: ongoing ? 'NEW RUN (ENDS THE CURRENT ONE)' : 'NEW RUN', action: () => this.showBuilders() });
    items.push({ label: 'BACK', action: () => this.toTitle() });
    this.listMenu(80, 120, 320, items);
    if (!saved.run && 'broken' in saved && saved.broken) this.text(80, 186, 'THE OLD SAVE CAN NOT BE READ.\nA NEW RUN REPLACES IT.', BAD);
    this.keys.ESC = () => this.toTitle();
  }

  private resume(run: RunState): void {
    this.run = run;
    this.showRun();
  }

  private showBuilders(): void {
    this.clear();
    this.text(VIEW_W / 2 - 80, 10, 'CHOOSE YOUR BUILDER', GOLD);
    const cols = 10;
    const cell = 44;
    const x0 = Math.round((VIEW_W - cols * cell) / 2);
    const y0 = 26;
    const frames: Phaser.GameObjects.Image[] = [];
    this.builders.forEach((id, i) => {
      const x = x0 + (i % cols) * cell;
      const y = y0 + Math.floor(i / cols) * cell;
      const frame = this.keep(this.add.image(x, y, panelTexture(this, 42, 42, 'slot')).setOrigin(0, 0).setInteractive({ useHandCursor: true }));
      this.keep(this.add.image(x + 2, y + 2, facesetKey(builderPortrait(D.builders[id]!))).setOrigin(0, 0));
      bindPress(frame, { onClick: () => (this.builderIndex === i ? this.startRun(id) : this.pickBuilder(i)), onHover: (over) => over && this.pickBuilder(i) });
      frames.push(frame);
    });
    // Details of the pointed-at builder: its six fighters.
    this.window(20, 120, 440, 116);
    const name = this.text(30, 128, '', GOLD);
    const faces = Array.from({ length: 6 }, (_, i) => this.keep(this.add.image(30 + i * 72, 142, '__DEFAULT').setOrigin(0, 0)));
    const labels = Array.from({ length: 6 }, (_, i) => this.text(30 + i * 72, 184, ''));
    this.text(30, 214, 'YOU START WITH ONE OF ITS FIRST TWO FIGHTERS.', DIM);
    this.button(296, 242, 76, 'START', () => this.startRun(this.builders[this.builderIndex]!));
    this.button(380, 242, 76, 'BACK', () => this.showStart());
    const refresh = () => {
      frames.forEach((f, i) => f.setTexture(panelTexture(this, 42, 42, i === this.builderIndex ? 'slotActive' : 'slot')));
      const b = D.builders[this.builders[this.builderIndex]!]!;
      name.setText(upper(b.name));
      const fighters = [...b.fighters].sort((a, c) => fighterTier(D, a) - fighterTier(D, c));
      fighters.forEach((id, i) => {
        faces[i]?.setTexture(facesetKey(id));
        labels[i]?.setText(`T${fighterTier(D, id)} ${D.units[id]!.goldCost ?? 0}\n${upper(D.units[id]!.name, 8)}`);
      });
    };
    this.pickBuilder = (i: number) => {
      this.builderIndex = (i + this.builders.length) % this.builders.length;
      refresh();
    };
    refresh();
    this.keys.LEFT = () => this.pickBuilder(this.builderIndex - 1);
    this.keys.RIGHT = () => this.pickBuilder(this.builderIndex + 1);
    this.keys.UP = () => this.pickBuilder(this.builderIndex - cols);
    this.keys.DOWN = () => this.pickBuilder(this.builderIndex + cols);
    this.keys.ENTER = this.keys.SPACE = () => this.startRun(this.builders[this.builderIndex]!);
    this.keys.ESC = () => this.showStart();
  }

  private pickBuilder = (_i: number): void => {};

  private startRun(builder: string, seed = Math.floor(Math.random() * 1e9)): void {
    sfx(this, 'click');
    this.run = newRun(D, seed, builder);
    this.commit();
  }

  /** Saves the run and shows whatever it needs next. */
  private commit(run?: RunState): void {
    if (run) this.run = run;
    saveRun(this.run!);
    this.showRun();
  }

  // ---- the run ----------------------------------------------------------------

  private showRun(): void {
    const run = this.run!;
    if (run.status === 'won' || run.status === 'lost') return this.showEnd();
    this.drawMap();
    if (run.status === 'reward') this.rewardOverlay();
    else if (run.status === 'shop') this.shopOverlay();
    else if (run.status === 'rest') this.restOverlay();
    else if (run.status === 'battle') this.battleOverlay();
  }

  private drawMap(): void {
    this.clear();
    const run = this.run!;
    const me = run.army.players[0]!;
    // Top bar: builder and act, king HP, gold and lumber, menu.
    this.window(2, 1, 476, 23);
    this.text(8, 8, `ACT ${run.act} ${upper(D.builders[run.builder]?.name ?? '?', 10)}`, GOLD);
    const max = kingMax(run, D);
    const bar = this.keep(this.add.graphics());
    bar.fillStyle(0x000000, 0.7).fillRect(176, 10, 60, 6);
    bar.fillStyle(0x60a0ff, 1).fillRect(177, 11, Math.ceil(58 * Math.max(0, run.army.king.hp / max)), 4);
    this.text(140, 8, 'KING');
    this.text(240, 8, `${Math.round(run.army.king.hp)}/${max}`);
    this.keep(this.add.image(320, 7, 'icon-coin').setOrigin(0, 0));
    this.text(330, 8, `${me.gold}`);
    this.keep(this.add.image(370, 7, 'icon-log').setOrigin(0, 0));
    this.text(380, 8, `${me.lumber}`);
    this.button(426, 4, 48, 'MENU', () => this.toTitle());

    // The act map: row 1 at the bottom, the boss on top.
    this.window(MAP.x, MAP.y, MAP.w, MAP.h);
    const rows = run.map.rows;
    const step = (MAP.h - 2 * 22) / (MAP_ROWS - 1);
    const pos = (n: MapNode) => ({
      x: Math.round(MAP.x + (MAP.w * (n.col + 1)) / (rows[n.row - 1]!.length + 1)),
      y: Math.round(MAP.y + MAP.h - 22 - (n.row - 1) * step),
    });
    const options = reachable(run);
    const visited = new Set(run.visited);
    const at = currentNode(run);
    const lines = this.keep(this.add.graphics());
    for (const row of rows) {
      for (const n of row) {
        const a = pos(n);
        for (const id of n.next) {
          const t = rows.flat().find((m) => m.id === id)!;
          const b = pos(t);
          const taken = visited.has(n.id) && visited.has(t.id);
          const open = at?.id === n.id && options.some((o) => o.id === t.id);
          lines.lineStyle(open ? 2 : 1, open ? GOLD : taken ? 0xffffff : 0x5a5a90, open || taken ? 1 : 0.8).lineBetween(a.x, a.y, b.x, b.y);
        }
      }
    }
    this.focus = Math.min(this.focus, Math.max(0, options.length - 1));
    const frames = new Map<string, Phaser.GameObjects.Image>();
    for (const row of rows) {
      for (const n of row) {
        const { x, y } = pos(n);
        const canGo = options.some((o) => o.id === n.id);
        const frame = this.keep(this.add.image(x, y, panelTexture(this, NODE, NODE, n.id === at?.id ? 'slotActive' : 'slot')).setInteractive({ useHandCursor: canGo }));
        const icon = this.keep(this.add.image(x, y, `node-${n.kind}`));
        if (visited.has(n.id) && n.id !== at?.id) {
          frame.setAlpha(0.5);
          icon.setAlpha(0.5);
        } else if (!canGo && n.id !== at?.id) {
          icon.setAlpha(0.8);
        }
        if (canGo) this.pulses.push(this.tweens.add({ targets: icon, scale: 1.15, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
        frames.set(n.id, frame);
        bindPress(frame, {
          onClick: () => canGo && run.status === 'map' && this.go(n),
          onHover: (over) => {
            if (!over) return;
            if (canGo) this.setFocus(options.indexOf(options.find((o) => o.id === n.id)!), options, frames);
            else this.setInfo(this.nodeInfo(n));
          },
        });
      }
    }

    this.drawSide();
    if (run.status === 'map' && options.length) {
      this.setFocus(this.focus, options, frames);
      this.keys.LEFT = () => this.setFocus(this.focus - 1, options, frames);
      this.keys.RIGHT = () => this.setFocus(this.focus + 1, options, frames);
      this.keys.ENTER = this.keys.SPACE = () => this.go(options[this.focus]!);
    }
    this.keys.ESC = () => this.toTitle();
  }

  private setFocus(i: number, options: MapNode[], frames: Map<string, Phaser.GameObjects.Image>): void {
    if (!options.length) return;
    this.focus = (i + options.length) % options.length;
    options.forEach((o, j) => frames.get(o.id)?.setTexture(panelTexture(this, NODE, NODE, j === this.focus ? 'slotHover' : 'slot')));
    this.setInfo(this.nodeInfo(options[this.focus]!));
  }

  private nodeInfo(n: MapNode): string {
    const run = this.run!;
    const wave = (w: number) => upper(D.units[D.waves[w - 1]?.creep ?? '']?.name ?? '?');
    // Only fights advance the waves: a node's waves are known once it is the next step (the boss always).
    const next = n.kind === 'boss' || reachable(run).some((o) => o.id === n.id);
    const w = next ? nodeWaves(run, n) : null;
    const waves = w ? (w[0] === w[1] ? `WAVE ${w[0]}: ${wave(w[0])}` : `WAVES ${w[0]}-${w[1]}: ${wave(w[0])}, ${wave(w[1])}`) : `NEXT FIGHT FROM WAVE ${run.wave}`;
    switch (n.kind) {
      case 'battle':
        return `BATTLE\n${waves}\nREWARD: A FIGHTER`;
      case 'elite': {
        const affix = n.affix && Object.hasOwn(AFFIXES, n.affix) ? AFFIXES[n.affix]! : null;
        return `ELITE: ${upper(affix?.name ?? '?')}\n${affix?.text ?? ''}\n${waves}\nREWARD: A STRONGER FIGHTER AND A RELIC`;
      }
      case 'boss':
        return `BOSS\n${waves}\nWIN IT TO CLEAR THE ACT`;
      case 'shop':
        return 'SHOP\nSPEND LUMBER ON RELICS, HEALING AND FIGHTERS';
      case 'rest':
        return 'REST\nHEAL THE KING OR TRAIN ONE MORE WISP';
      case 'treasure':
        return 'TREASURE\nPICK ONE OF TWO RELICS';
    }
  }

  /** Side panel text, wrapped to its width. */
  private setInfo(s: string): void {
    this.info?.setText(s.split('\n').flatMap((l) => wrap(l, 20)).join('\n'));
  }

  private drawSide(): void {
    const run = this.run!;
    const me = run.army.players[0]!;
    const { x, y, w } = SIDE;
    this.window(x, y, w, SIDE.h);
    this.text(x + 8, y + 7, `ROSTER ${me.fighters.length}/${ROSTER_CAP}`, GOLD);
    me.fighters.forEach((id, i) => {
      const face = this.keep(this.add.image(x + 8 + (i % 5) * 32, y + 18 + Math.floor(i / 5) * 32, facesetKey(id)).setOrigin(0, 0).setScale(0.75).setInteractive());
      bindPress(face, { onClick: () => this.setInfo(this.fighterInfo(id)), onHover: (over) => over && this.setInfo(this.fighterInfo(id)) });
    });
    this.text(x + 8, y + 86, `RELICS ${run.relics.length}`, GOLD);
    run.relics.forEach((id, i) => {
      const icon = this.keep(this.add.image(x + 8 + (i % 6) * 26, y + 97 + Math.floor(i / 6) * 26, 'icon-relic').setOrigin(0, 0).setInteractive());
      const r = RELICS[id];
      const info = r ? `${upper(r.name)}\n${r.text}` : id;
      bindPress(icon, { onClick: () => this.setInfo(info), onHover: (over) => over && this.setInfo(info) });
    });
    this.text(x + 8, y + 152, `UNITS ${run.army.units.length}  WISPS ${me.workers}`, DIM);
    this.info = this.text(x + 8, y + 166, '');
    this.setInfo(run.status === 'map' ? (TOUCH ? 'TAP A GLOWING NODE' : 'PICK A GLOWING NODE (ARROWS, ENTER)') : '');
  }

  private fighterInfo(id: string): string {
    const u = D.units[id]!;
    const from = builderOf(id);
    const kind = u.attack.range > MELEE_RANGE ? 'RANGED' : 'MELEE';
    const abilities = (u.abilities ?? []).map(describeAbility).join('\n');
    return `${upper(u.name)}\nT${fighterTier(D, id)} ${upper(from?.name ?? '')} ${u.goldCost ?? 0} GOLD\n${ATTACK_INFO[u.attack.type].name} ${kind}, ${ARMOR_INFO[u.armorType].name}\n${abilities}`;
  }

  private go(node: MapNode): void {
    const next = enterNode(this.run!, D, node.id);
    if (next === this.run) return sfx(this, 'error');
    sfx(this, 'click');
    this.run = next;
    saveRun(next);
    if (next.status === 'battle') this.toBattle();
    else this.showRun();
  }

  private toBattle(): void {
    this.scene.start('battle', { campaign: this.run });
  }

  // ---- overlays ---------------------------------------------------------------

  /** A started battle that was left (reload, closed app): it starts over from the node's beginning. */
  private battleOverlay(): void {
    const node = currentNode(this.run!);
    const depth = OVERLAY_DEPTH;
    this.blocker(depth);
    this.window(120, 90, 240, 76, depth);
    this.text(136, 100, `${node ? NODE_NAME[node.kind] : 'BATTLE'} AHEAD`, GOLD, depth);
    this.text(136, 114, 'THE NODE STARTS OVER\nFROM ITS FIRST WAVE.', DIM, depth);
    this.button(136, 142, 100, 'FIGHT!', () => this.toBattle(), depth);
    this.button(244, 142, 100, 'MENU', () => this.toTitle(), depth);
    this.keys.ENTER = this.keys.SPACE = () => this.toBattle();
    this.keys.ESC = () => this.toTitle();
  }

  /** Up to four cards in a row; click, number keys or arrows + Enter pick one. */
  private cards(
    y: number,
    w: number,
    h: number,
    count: number,
    draw: (i: number, x: number, y: number) => void,
    pick: (i: number) => void,
    enabled: (i: number) => boolean = () => true,
  ): void {
    const depth = OVERLAY_DEPTH + 1;
    const gap = 8;
    const x0 = Math.round((VIEW_W - (count * w + (count - 1) * gap)) / 2);
    const frames: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < count; i++) {
      const x = x0 + i * (w + gap);
      const frame = this.keep(this.add.image(x, y, panelTexture(this, w, h, 'slot')).setOrigin(0, 0).setDepth(depth).setInteractive({ useHandCursor: true }));
      if (!enabled(i)) frame.setAlpha(0.5);
      bindPress(frame, { onClick: () => pick(i), onHover: (over) => over && setFocus(i) });
      frames.push(frame);
      draw(i, x, y);
      if (!TOUCH && count > 1) this.text(x + w - 12, y + 4, String(i + 1), DIM, depth + 1);
    }
    const setFocus = (i: number) => {
      this.cardFocus = (i + count) % count;
      frames.forEach((f, j) => f.setTexture(panelTexture(this, w, h, j === this.cardFocus ? 'slotHover' : 'slot')));
    };
    setFocus(Math.min(this.cardFocus, count - 1));
    this.keys.LEFT = () => setFocus(this.cardFocus - 1);
    this.keys.RIGHT = () => setFocus(this.cardFocus + 1);
    this.keys.ENTER = this.keys.SPACE = () => pick(this.cardFocus);
    (['ONE', 'TWO', 'THREE', 'FOUR'] as const).slice(0, count).forEach((k, i) => (this.keys[k] = () => pick(i)));
  }

  private fighterCard(id: string, x: number, y: number, w: number, depth: number): void {
    const u = D.units[id]!;
    const own = builderOf(id)?.id === this.run!.builder;
    this.keep(this.add.image(x + Math.round((w - 38) / 2), y + 8, facesetKey(id)).setOrigin(0, 0).setDepth(depth));
    const lines = [
      { s: upper(u.name, 14), c: 0xffffff },
      // Own builder in gold, others in blue.
      { s: `T${fighterTier(D, id)} ${upper(builderOf(id)?.name ?? '', 9)}`, c: own ? GOLD : 0x98c8ff },
      { s: `COST ${u.goldCost ?? 0} GOLD`, c: DIM },
      { s: `${ATTACK_INFO[u.attack.type].name} ${u.attack.range > MELEE_RANGE ? 'RANGED' : 'MELEE'}`, c: ATTACK_INFO[u.attack.type].color },
      { s: `${ARMOR_INFO[u.armorType].name} ARMOR`, c: ARMOR_INFO[u.armorType].color },
      { s: `${u.hp} HP`, c: 0xffffff },
      { s: `${u.attack.damage[0]}-${u.attack.damage[1]} DAMAGE`, c: 0xffffff },
      ...(u.abilities ?? []).slice(0, 2).map((a) => ({ s: describeAbility(a).slice(0, 14), c: 0x80ff90 })),
    ];
    lines.forEach((l, i) => this.text(x + 6, y + 50 + i * 11, l.s, l.c, depth));
  }

  private relicCard(id: string, x: number, y: number, depth: number): void {
    const r = RELICS[id];
    this.keep(this.add.image(x + 8, y + 8, 'icon-relic').setOrigin(0, 0).setDepth(depth));
    this.text(x + 36, y + 10, r?.rarity === 'rare' ? 'RARE' : 'RELIC', r?.rarity === 'rare' ? 0xd078ff : DIM, depth);
    this.text(x + 6, y + 40, upper(r?.name ?? id, 14), GOLD, depth);
    this.text(x + 6, y + 54, wrap(r?.text ?? '', 14).join('\n'), 0xffffff, depth);
  }

  private rewardOverlay(): void {
    const run = this.run!;
    const reward = run.rewards[0]!;
    const depth = OVERLAY_DEPTH;
    const start = reward.kind === 'draft' && run.army.players[0]!.fighters.length === 0;
    this.blocker(depth);
    const h = reward.kind === 'draft' ? 168 : 130;
    this.window(40, 30, 400, h + 52, depth);
    const title = start ? 'CHOOSE YOUR FIRST FIGHTER' : reward.kind === 'draft' ? 'CHOOSE A FIGHTER' : 'CHOOSE A RELIC';
    this.text(56, 40, title, GOLD, depth);
    const full = reward.kind === 'draft' && run.army.players[0]!.fighters.length >= ROSTER_CAP;
    if (full) this.text(56, 52, 'ROSTER FULL: YOU WILL DROP ONE', BAD, depth);
    const w = 120;
    this.cards(
      62,
      w,
      h,
      reward.options.length,
      (i, x, y) => (reward.kind === 'draft' ? this.fighterCard(reward.options[i]!, x, y, w, depth + 2) : this.relicCard(reward.options[i]!, x, y, depth + 2)),
      (i) => (full ? this.replaceOverlay(i) : this.take(chooseReward(run, D, i))),
    );
    if (!start) {
      const label = reward.kind === 'draft' ? `SKIP (+${SKIP_LUMBER} LUMBER)` : 'SKIP';
      this.button(VIEW_W / 2 - 70, 62 + h + 4, 140, label, () => this.take(chooseReward(run, D, null)), depth + 2);
      this.keys.S = () => this.take(chooseReward(run, D, null));
    }
  }

  /** Full roster: which fighter makes room (its built units stay on the grid). */
  private replaceOverlay(pick: number): void {
    const run = this.run!;
    const me = run.army.players[0]!;
    const depth = OVERLAY_DEPTH + 20;
    this.blocker(depth);
    this.window(60, 60, 360, 150, depth);
    this.text(76, 70, 'DROP WHICH FIGHTER?', GOLD, depth);
    this.text(76, 82, 'BUILT ONES STAY ON THE GRID.', DIM, depth);
    me.fighters.forEach((id, i) => {
      const x = 76 + (i % 5) * 66;
      const y = 98 + Math.floor(i / 5) * 46;
      const face = this.keep(this.add.image(x, y, facesetKey(id)).setOrigin(0, 0).setDepth(depth).setInteractive({ useHandCursor: true }));
      this.text(x, y + 38, upper(D.units[id]!.name, 7), 0xffffff, depth);
      bindPress(face, { onClick: () => this.take(chooseReward(run, D, pick, id)) });
    });
    this.button(VIEW_W / 2 - 40, 190, 80, 'CANCEL', () => this.showRun(), depth);
    this.keys = { ESC: () => this.showRun() };
  }

  private take(next: RunState): void {
    if (next === this.run) return sfx(this, 'error');
    sfx(this, 'upgrade');
    this.cardFocus = 0;
    this.commit(next);
  }

  private shopOverlay(): void {
    const run = this.run!;
    const depth = OVERLAY_DEPTH;
    this.blocker(depth);
    this.window(30, 36, 420, 196, depth);
    this.text(46, 46, 'SHOP', GOLD, depth);
    this.keep(this.add.image(100, 45, 'icon-log').setOrigin(0, 0).setDepth(depth));
    this.text(110, 46, `${run.army.players[0]!.lumber} LUMBER`, 0xffffff, depth);
    const w = 96;
    const lumber = run.army.players[0]!.lumber;
    const offerText = (o: ShopOffer): [string, string] =>
      o.kind === 'relic'
        ? [upper(RELICS[o.relic]?.name ?? o.relic), RELICS[o.relic]?.text ?? '']
        : o.kind === 'heal'
          ? ['HEALING', `KING +${Math.round(SHOP_HEAL * 100)}% HP`]
          : ['RECRUIT', 'CHOOSE 1 OF 3 FIGHTERS'];
    this.cards(
      62,
      w,
      134,
      run.shop.length,
      (i, x, y) => {
        const o = run.shop[i]!;
        const [name, text] = offerText(o);
        const d = depth + 2;
        this.keep(this.add.image(x + 6, y + 6, o.kind === 'relic' ? 'icon-relic' : o.kind === 'heal' ? 'btn-hp' : 'node-battle').setOrigin(0, 0).setDepth(d));
        // Long relic names take two lines.
        const nameLines = wrap(name, 11);
        this.text(x + 6, y + 36, nameLines.join('\n'), GOLD, d);
        this.text(x + 6, y + 40 + nameLines.length * 11, wrap(text, 11).join('\n'), 0xffffff, d);
        if (o.sold) this.text(x + 6, y + 116, 'SOLD', DIM, d);
        else {
          this.keep(this.add.image(x + 6, y + 115, 'icon-log').setOrigin(0, 0).setDepth(d));
          this.text(x + 16, y + 116, `${o.price}`, lumber >= o.price ? 0xffffff : BAD, d);
        }
      },
      (i) => this.take(shopBuy(run, D, i)),
      (i) => !run.shop[i]!.sold && lumber >= run.shop[i]!.price,
    );
    this.button(VIEW_W / 2 - 40, 204, 80, 'LEAVE', () => this.take(leaveShop(run)), depth + 2);
    this.keys.ESC = () => this.take(leaveShop(run));
  }

  private restOverlay(): void {
    const run = this.run!;
    const depth = OVERLAY_DEPTH;
    const me = run.army.players[0]!;
    this.blocker(depth);
    this.window(100, 50, 280, 170, depth);
    this.text(116, 60, 'REST BY THE FIRE', GOLD, depth);
    const max = kingMax(run, D);
    const healTo = Math.min(max, run.army.king.hp + Math.round(max * REST_HEAL));
    const train = me.workers < D.rules.maxWorkers ? 'ONE MORE WISP GATHERS LUMBER' : `WISPS MAXED: +${D.rules.workerCost} GOLD`;
    const options: [string, string, string][] = [
      ['btn-regen', 'HEAL', `KING +${Math.round(REST_HEAL * 100)}% HP (${Math.round(run.army.king.hp)} TO ${healTo})`],
      ['btn-worker', 'TRAIN', train],
    ];
    this.cards(
      78,
      120,
      126,
      2,
      (i, x, y) => {
        const [icon, name, text] = options[i]!;
        this.keep(this.add.image(x + 6, y + 6, icon).setOrigin(0, 0).setDepth(depth + 2));
        this.text(x + 6, y + 38, name, GOLD, depth + 2);
        this.text(x + 6, y + 52, wrap(text, 13).join('\n'), 0xffffff, depth + 2);
      },
      (i) => this.take(rest(run, D, i === 0 ? 'heal' : 'train')),
    );
  }

  private showEnd(): void {
    this.clear();
    const run = this.run!;
    const won = run.status === 'won';
    // The run is over: nothing left to continue.
    clearRun();
    this.keep(this.add.bitmapText(VIEW_W / 2, 50, FONT, won ? 'ACT CLEARED!' : 'THE KING HAS FALLEN').setOrigin(0.5).setScale(2).setTint(won ? 0xffd060 : BAD));
    const me = run.army.players[0]!;
    const node = currentNode(run);
    const lines = [
      `${upper(D.builders[run.builder]?.name ?? '?')}, ACT ${run.act}${node ? `, ROW ${node.row}` : ''}`,
      '',
      `WAVES CLEARED  ${run.stats.waves}`,
      `NODES          ${run.stats.nodes}`,
      `ELITES BEATEN  ${run.stats.elites}`,
      `LEAKS          ${run.stats.leaks}`,
      `ROSTER         ${me.fighters.length}`,
      `RELICS         ${run.relics.length}`,
      '',
      won ? 'WELL DONE! MORE ACTS COME SOON.' : 'EVERY RUN TEACHES SOMETHING.',
    ];
    this.window(90, 76, 300, lines.length * 11 + 16);
    this.text(106, 84, lines.join('\n'));
    this.button(VIEW_W / 2 - 110, 232, 100, 'NEW RUN', () => this.showBuilders());
    this.button(VIEW_W / 2 + 10, 232, 100, 'MENU', () => this.toTitle());
    this.keys.ENTER = this.keys.SPACE = () => this.showBuilders();
    this.keys.ESC = () => this.toTitle();
  }
}
