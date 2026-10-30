import Phaser from 'phaser';
import { describeAbility, rerollCost, type GameView, type KingStat, type TeamId, type UnitDef, type UnitState } from '@legion/shared';
import { DIR, UNIT_SPRITES, builderPortrait, spriteKey } from '../assets/manifest.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window, panelTexture } from './ff6Window.ts';
import { RichLine, richText, type Segment } from './RichLine.ts';
import { MiniButton, SlotButton, TabButton } from './SlotButton.ts';
import { ARMOR_ICON, ARMOR_INFO, ATTACK_INFO, ATTACK_ORDER, multiplierColor } from './typeInfo.ts';
import { SLOT_KEYS } from './keys.ts';
import { teamColor } from './playerColors.ts';
import { TOUCH, bindPress } from './touch.ts';

/** What the command card offers: fighters for gold or sends for lumber. */
export type SlotMode = 'build' | 'send';

/** Sends per command card page (the whole 4x3 grid). */
export const SEND_PAGE_SIZE = SLOT_KEYS.length;
/** Build mode: the Prophet's reroll sits in the last slot. */
export const REROLL_SLOT = SLOT_KEYS.length - 1;

export interface HudState {
  /** Fighter slot armed for placement, or null. */
  selectedBuild: number | null;
  selectedUnit: number | null;
  /** Unit under the mouse on the battlefield. */
  hoverUnit: number | null;
  slotMode: SlotMode;
  sendPage: number;
  viewArea: number;
}

export interface HudView {
  /** Areas this tab shows; clicking again steps through them. */
  areas: number[];
  label: string;
  /** King views flash their tab when that king takes damage. */
  kingTeam?: TeamId;
}

export interface HudActions {
  /** Slot i: pick a fighter to build or send a merc, depending on the slot mode. */
  pickSlot(i: number): void;
  setSlotMode(mode: SlotMode): void;
  nextSendPage(): void;
  toggleTypeChart(): void;
  upgrade(to: string): void;
  sell(): void;
  buyWorker(): void;
  upgradeFarm(): void;
  upgradeKing(stat: KingStat): void;
  selectView(index: number): void;
}

const KING_BUTTONS: { stat: KingStat; icon: string; key: string; title: string }[] = [
  { stat: 'hp', icon: 'btn-hp', key: 'H', title: 'KING HP' },
  { stat: 'attack', icon: 'btn-attack', key: 'J', title: 'KING ATTACK' },
  { stat: 'regen', icon: 'btn-regen', key: 'K', title: 'KING REGEN' },
];

type Hover =
  | { on: 'slot'; index: number }
  | { on: 'action'; index: number }
  | { on: 'mode'; mode: SlotMode }
  | { on: 'page' }
  | { on: 'chart' }
  | { on: 'worker' }
  | { on: 'farm' }
  | { on: 'king'; stat: KingStat }
  | { on: 'wave' };

/** How the info panel compares a unit: a fighter against the wave, an attacker by its weak spots. */
type Role = 'fighter' | 'attacker' | 'none';

export function facesetKey(unitId: string): string {
  const spec = UNIT_SPRITES[unitId];
  return spec ? `${spriteKey(spec)}-Face` : '__DEFAULT';
}

const pct = (m: number) => `${Math.round(m * 100)}%`;

/** Distinct merc kinds the send queue strip can list. */
const QUEUE_GROUPS = 10;
/** Lines the info panel body can hold. */
const BODY_LINES = 4;
/** King HP bars in the top bar; the next-wave button sits right of them. */
const KING_BAR = { x: 280, w: 96 };
/** Gold/lumber gains within this window pop up as one "+N" at their counter. */
const RES_POP_MS = 300;
/** Where each counter sits and how its "+N" is tinted. */
const RES_POP = { gold: { x: 356, tint: 0xffe040 }, lumber: { x: 418, tint: 0x90e070 } } as const;

/** Bottom command panels and top status bar, mouse and keyboard driven. */
export class Hud {
  private hover: Hover | null = null;
  private readonly topText: Phaser.GameObjects.BitmapText;
  private readonly tabs: TabButton[];
  private readonly kingBars: Phaser.GameObjects.Graphics;
  private readonly lastKingHp: Record<TeamId, number> = { 0: Infinity, 1: Infinity };
  /** Creeps and sends still alive on each team's side, next to its king bar. */
  private readonly alive: Phaser.GameObjects.BitmapText[];
  private readonly slots: SlotButton[];
  private readonly modeButtons: Record<SlotMode, MiniButton>;
  private readonly pageButton: MiniButton;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly infoName: Phaser.GameObjects.BitmapText;
  private readonly infoSub: RichLine;
  private readonly stats: Phaser.GameObjects.Container;
  private readonly statIcons: Phaser.GameObjects.Image[];
  private readonly statText: Phaser.GameObjects.BitmapText[];
  private readonly types: RichLine;
  private readonly matchup: RichLine;
  private readonly infoBody: RichLine[];
  private readonly waveButton: {
    bg: Phaser.GameObjects.Image;
    icon: Phaser.GameObjects.Image;
    text: Phaser.GameObjects.BitmapText;
    textures: Record<'slot' | 'slotHover' | 'slotActive', string>;
  };
  private waveButtonState = '';
  /** The wave preview stays in the info panel until clicked again (or a unit gets selected). */
  private wavePinned = false;
  private lastSelected: number | null = null;
  private readonly resPop: Record<keyof typeof RES_POP, { last: number | null; pending: number; since: number }> = {
    gold: { last: null, pending: 0, since: 0 },
    lumber: { last: null, pending: 0, since: 0 },
  };
  private readonly actions: SlotButton[];
  private actionTargets: ({ kind: 'upgrade'; to: string } | { kind: 'sell' })[] = [];
  private readonly res: Record<'gold' | 'lumber' | 'income' | 'food', Phaser.GameObjects.BitmapText>;
  private readonly worker: SlotButton;
  private readonly farm: SlotButton;
  private readonly kingButtons: SlotButton[];
  private portraitState = '';
  private readonly queueBox: Phaser.GameObjects.Image;
  private readonly queueLabel: Phaser.GameObjects.BitmapText;
  private readonly queueIcons: { img: Phaser.GameObjects.Image; count: Phaser.GameObjects.BitmapText }[];
  private queueState = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameView,
    private readonly player: number,
    private readonly views: HudView[],
    private readonly act: HudActions,
  ) {
    const hoverFn = (h: Hover) => (over: boolean) => {
      if (over) this.hover = h;
      else if (this.hover && JSON.stringify(this.hover) === JSON.stringify(h)) this.hover = null;
    };

    // Top bar (y 1..24); the battlefield viewport sits below it.
    ff6Window(scene, 2, 1, 476, 23);
    this.topText = scene.add.bitmapText(8, 4, FONT, '').setLineSpacing(2);
    this.tabs = views.map((v, i) => new TabButton(scene, 84 + i * 41, 2, 39, 21, v.label, () => act.selectView(i)));
    const myTeam = game.players[player]!.team;
    scene.add.bitmapText(252, 4, FONT, 'MY').setTint(teamColor(myTeam));
    scene.add.bitmapText(252, 14, FONT, 'FOE').setTint(teamColor(myTeam === 0 ? 1 : 0));
    this.kingBars = scene.add.graphics();
    this.alive = [0, 1].map((row) => scene.add.bitmapText(474, 4 + row * 10, FONT, '').setOrigin(1, 0));
    // Next wave: hover shows it in the info panel, a click (or I) pins it there.
    const waveTextures = {
      slot: panelTexture(scene, 52, 21, 'slot'),
      slotHover: panelTexture(scene, 52, 21, 'slotHover'),
      slotActive: panelTexture(scene, 52, 21, 'slotActive'),
    };
    const waveBg = scene.add.image(KING_BAR.x + KING_BAR.w + 4, 2, waveTextures.slot).setOrigin(0, 0);
    const waveIcon = scene.add.image(waveBg.x + 11, 13, '__DEFAULT');
    this.waveButton = {
      bg: waveBg,
      icon: waveIcon,
      text: scene.add.bitmapText(waveBg.x + 21, 4, FONT, '').setLineSpacing(2),
      textures: waveTextures,
    };
    const waveHover = hoverFn({ on: 'wave' });
    bindPress(waveBg.setInteractive({ useHandCursor: true }), { onClick: () => this.toggleWave(), onHover: waveHover });

    // Bottom panels (y 186..270). Left: 4x3 command card (QWER / ASDF / YXCV) plus a column of mode buttons.
    ff6Window(scene, 2, 186, 178, 84);
    this.slots = SLOT_KEYS.map((_, i) =>
      new SlotButton(scene, {
        x: 5 + (i % 4) * 39,
        y: 189 + Math.floor(i / 4) * 26,
        w: 38,
        h: 25,
        iconY: 0,
        iconCrop: { top: 5, height: 25 },
        badgeRow: true,
        onClick: () => act.pickSlot(i),
        onHover: hoverFn({ on: 'slot', index: i }),
      }),
    );
    // Touch: the column gets the full width up to the window border, for fingers.
    const [miniX, miniSize, miniY] = TOUCH ? [162, 16, [189, 206, 225, 250]] : [164, 13, [189, 203, 222, 254]];
    const mini = (y: number, icon: { icon?: string; text?: string }, onClick: () => void, hover: Hover) =>
      new MiniButton(scene, { x: miniX, y, size: miniSize, touchPad: 2, ...icon, onClick, onHover: hoverFn(hover) });
    this.modeButtons = {
      build: mini(miniY[0]!, { icon: 'icon-coin' }, () => act.setSlotMode('build'), { on: 'mode', mode: 'build' }),
      send: mini(miniY[1]!, { icon: 'icon-log' }, () => act.setSlotMode('send'), { on: 'mode', mode: 'send' }),
    };
    this.pageButton = mini(miniY[2]!, { text: '>' }, () => act.nextSendPage(), { on: 'page' });
    mini(miniY[3]!, { text: '?' }, () => act.toggleTypeChart(), { on: 'chart' });
    this.hand = scene.add.image(0, 0, 'icon-hand').setOrigin(1, 0.5).setDepth(1);
    scene.tweens.add({ targets: this.hand, x: '-=2', duration: 300, yoyo: true, repeat: -1 });

    // Send queue: what this player bought for the next wave start, just above the command card.
    this.queueBox = ff6Window(scene, 2, 164, 60, 21).setVisible(false);
    this.queueLabel = scene.add.bitmapText(7, 171, FONT, '').setTint(0xc0c8f0);
    this.queueIcons = Array.from({ length: QUEUE_GROUPS }, () => {
      const img = scene.add.image(0, 167, '__DEFAULT').setOrigin(0, 0).setVisible(false);
      return { img, count: scene.add.bitmapText(0, 175, FONT, '') };
    });

    // Middle: info / tooltip.
    ff6Window(scene, 182, 186, 156, 84);
    this.portrait = scene.add.image(186, 190, '__DEFAULT').setOrigin(0, 0);
    this.infoName = scene.add.bitmapText(228, 190, FONT, '');
    this.infoSub = new RichLine(scene, 228, 199);
    // HP, damage (attack type icon), armor (armor type icon), range.
    this.statIcons = ['icon-heart', 'icon-sword', 'icon-shield', 'icon-range'].map((key, i) =>
      scene.add.image(228 + (i % 2) * 52, 209 + Math.floor(i / 2) * 10, key).setOrigin(0, 0),
    );
    this.statText = this.statIcons.map((_, i) => scene.add.bitmapText(238 + (i % 2) * 52, 210 + Math.floor(i / 2) * 10, FONT, ''));
    this.stats = scene.add.container(0, 0, [...this.statIcons, ...this.statText]);
    this.types = new RichLine(scene, 187, 230);
    this.matchup = new RichLine(scene, 187, 240);
    this.infoBody = Array.from({ length: BODY_LINES }, (_, i) => new RichLine(scene, 187, 250 + i * 9));
    this.actions = Array.from({ length: 3 }, (_, i) =>
      new SlotButton(scene, {
        x: 186 + i * 50,
        y: 231,
        w: 48,
        h: 36,
        onClick: () => this.runAction(i),
        onHover: hoverFn({ on: 'action', index: i }),
      }),
    );

    // Right: resources, wisps and king upgrades.
    ff6Window(scene, 340, 186, 138, 84);
    scene.add.image(346, 191, 'icon-coin').setOrigin(0, 0);
    scene.add.image(408, 191, 'icon-log').setOrigin(0, 0);
    scene.add.image(408, 202, 'icon-food').setOrigin(0, 0);
    this.res = {
      gold: scene.add.bitmapText(356, 190, FONT, ''),
      lumber: scene.add.bitmapText(418, 190, FONT, ''),
      income: scene.add.bitmapText(346, 201, FONT, ''),
      food: scene.add.bitmapText(418, 201, FONT, ''),
    };
    this.worker = new SlotButton(scene, { x: 343, y: 225, w: 26, h: 40, onClick: () => act.buyWorker(), onHover: hoverFn({ on: 'worker' }) });
    this.farm = new SlotButton(scene, { x: 370, y: 225, w: 26, h: 40, onClick: () => act.upgradeFarm(), onHover: hoverFn({ on: 'farm' }) });
    this.kingButtons = KING_BUTTONS.map(
      (k, i) =>
        new SlotButton(scene, {
          x: 397 + i * 27,
          y: 225,
          w: 26,
          h: 40,
          onClick: () => act.upgradeKing(k.stat),
          onHover: hoverFn({ on: 'king', stat: k.stat }),
        }),
    );
    scene.add.bitmapText(421, 214, FONT, 'KING').setTint(0xc0c8f0);
  }

  /** Pin or unpin the next-wave preview in the info panel. */
  toggleWave(): void {
    this.wavePinned = !this.wavePinned;
  }

  unpinWave(): void {
    this.wavePinned = false;
  }

  update(s: HudState): void {
    const g = this.game;
    const me = g.players[this.player]!;
    this.drawTop(s);

    // Slots: fighters for gold (placeable between waves, browsable during one), or sends for lumber.
    const send = s.slotMode === 'send';
    const open = g.phase === 'build' || g.phase === 'fight';
    const prophet = !!g.data.builders[me.builder]?.random;
    const sends = Object.values(g.data.mercs);
    const pages = Math.ceil(sends.length / SEND_PAGE_SIZE);
    const build = g.phase === 'build';
    this.modeButtons.build.setState(open, !send);
    this.modeButtons.send.setState(open, send);
    this.pageButton.setVisible(send && open && pages > 1);
    this.hand.setVisible(false);
    const wave = g.data.waves[g.wave - 1];
    const creep = wave ? g.data.units[wave.creep] : undefined;
    this.slots.forEach((slot, i) => {
      if (send) {
        const merc = sends[s.sendPage * SEND_PAGE_SIZE + i];
        slot.setVisible(!!merc && open);
        if (!merc) return;
        // Advanced sends stay locked until their wave.
        const locked = g.wave < (merc.minWave ?? 0);
        const ok = !locked && me.lumber >= merc.lumberCost;
        slot.setContent(facesetKey(merc.unit), locked ? `W${merc.minWave}` : String(merc.lumberCost), {
          corner: SLOT_KEYS[i],
          costIcon: locked ? undefined : 'icon-log',
          labelColor: ok || locked ? 0xffffff : 0xff7070,
          badges: this.badges(g.data.units[merc.unit]!),
        });
        slot.setState(ok);
        return;
      }
      if (i === REROLL_SLOT && prophet) {
        const left = g.data.rules.prophet.rerolls - me.rerolls;
        const cost = rerollCost(g.data, me);
        const ok = build && left > 0 && me.gold >= cost && me.lumber >= cost;
        slot.setVisible(open);
        slot.setContent(facesetKey(builderPortrait(g.data.builders[me.builder]!)), left > 0 ? String(cost) : 'MAX', {
          corner: SLOT_KEYS[i],
          costIcon: left > 0 ? 'icon-coin' : undefined,
          labelColor: ok || left <= 0 ? 0xffffff : 0xff7070,
        });
        slot.setState(ok);
        return;
      }
      const id = me.fighters[i];
      slot.setVisible(!!id && open);
      if (!id) return;
      const d = g.data.units[id]!;
      const cost = d.goldCost ?? 0;
      const ok = build && me.gold >= cost;
      const active = i === s.selectedBuild;
      // The badge backing hints whether this attack type suits the coming wave.
      const vs = creep ? g.data.damageTable[d.attack.type][creep.armorType] : 1;
      slot.setContent(facesetKey(id), String(cost), {
        corner: SLOT_KEYS[i],
        costIcon: 'icon-coin',
        labelColor: ok || !build ? 0xffffff : 0xff7070,
        badges: this.badges(d),
        badgeBg: vs > 1.001 ? 0x1c6a28 : vs < 0.999 ? 0x7a2020 : undefined,
      });
      slot.setState(ok, active, s.selectedBuild !== null && !active);
      if (active) this.hand.setVisible(true).setPosition(slot.root.x + 2, slot.root.y + 13);
    });

    // Resources and upgrade buttons.
    this.res.gold.setText(String(me.gold));
    this.res.lumber.setText(String(me.lumber));
    this.res.income.setText(`INC+${me.income}`);
    this.res.food.setText(`${g.foodUsed(this.player)}/${me.foodCap}`);
    this.popRes('gold', me.gold);
    this.popRes('lumber', me.lumber);
    const r = g.data.rules;
    this.worker.setContent('btn-worker', `${me.workers}`, { corner: 'B' }).setState(me.gold >= r.workerCost && me.workers < r.maxWorkers);
    const farm = r.farms[me.farmLevel];
    this.farm.setContent('btn-farm', `${me.farmLevel}`, { corner: 'G' }).setState(!!farm && me.gold >= farm.gold && me.lumber >= farm.lumber);
    this.kingButtons.forEach((b, i) => {
      const k = KING_BUTTONS[i]!;
      const lvl = g.kingLevels[me.team][k.stat];
      b.setContent(k.icon, `${lvl}`, { corner: k.key }).setState(me.lumber >= r.king.upgradeLumber && lvl < this.kingMax(k.stat));
    });

    this.drawQueue();
    this.drawInfo(s);
  }

  /** Bought sends grouped by kind ("imp x3"), with the wave they will join. */
  private drawQueue(): void {
    const g = this.game;
    const queued = g.players[this.player]!.queuedSends;
    const joins = g.phase === 'build' ? g.wave : g.wave + 1;
    const state = `${joins}:${queued.join()}`;
    if (state === this.queueState) return;
    this.queueState = state;
    const counts = new Map<string, number>();
    for (const id of queued) counts.set(id, (counts.get(id) ?? 0) + 1);
    const groups = [...counts].slice(0, QUEUE_GROUPS);
    const label = `W${joins}`;
    this.queueLabel.setText(groups.length ? label : '');
    let x = 7 + label.length * 8 + 4;
    this.queueIcons.forEach((q, i) => {
      const group = groups[i];
      const unit = group && g.data.mercs[group[0]]?.unit;
      const spec = unit ? UNIT_SPRITES[unit] : undefined;
      q.img.setVisible(!!spec);
      q.count.setVisible(!!spec);
      if (!group || !spec) return;
      q.img.setTexture(spec.kind === 'character' ? `${spriteKey(spec)}-Idle` : `${spriteKey(spec)}-Walk`, DIR.left).setX(x);
      const n = group[1] > 1 ? String(group[1]) : '';
      q.count.setText(n).setX(x + 14);
      x += 16 + (n ? n.length * 8 : 0) + 2;
    });
    const w = x + 3;
    this.queueBox.setVisible(groups.length > 0);
    if (groups.length) this.queueBox.setTexture(panelTexture(this.scene, w, 21, 'window'));
  }

  /** Attack and armor type icons for a slot corner. */
  private badges(d: UnitDef): { icon: string; tint: number }[] {
    const atk = ATTACK_INFO[d.attack.type];
    return [
      { icon: atk.icon, tint: atk.color },
      { icon: ARMOR_ICON, tint: ARMOR_INFO[d.armorType].color },
    ];
  }

  // ---- info panel ---------------------------------------------------------------

  private drawInfo(s: HudState): void {
    const g = this.game;
    const me = g.players[this.player]!;
    const r = g.data.rules;
    const h = this.hover;
    if (s.selectedUnit !== this.lastSelected) {
      this.lastSelected = s.selectedUnit;
      if (s.selectedUnit !== null) this.wavePinned = false;
    }
    const selected = s.selectedUnit !== null ? g.units.get(s.selectedUnit) : undefined;
    const ownFighter = selected?.kind === 'fighter' && selected.owner === this.player ? selected : undefined;
    // Hovering the selected unit itself must not hide its upgrade/sell buttons.
    const hoveredOther = s.hoverUnit !== null && s.hoverUnit !== s.selectedUnit;
    const showActions = !!ownFighter && g.phase === 'build' && (!h || h.on === 'action') && !hoveredOther && !this.wavePinned;
    this.updateActions(showActions ? ownFighter : undefined);

    if (h?.on === 'slot') {
      if (s.slotMode === 'send') {
        const merc = Object.values(g.data.mercs)[s.sendPage * SEND_PAGE_SIZE + h.index];
        // Build-phase sends join the coming wave, sends during a wave the one after.
        const joins = g.phase === 'build' ? g.wave : g.wave + 1;
        if (merc) return this.showUnit(merc.unit, `SEND {log}${merc.lumberCost}`, 'attacker', `+${merc.incomeGain} INCOME\nJOINS WAVE ${joins}`);
      } else if (h.index === REROLL_SLOT && g.data.builders[me.builder]?.random) {
        const left = r.prophet.rerolls - me.rerolls;
        const cost = rerollCost(g.data, me);
        const price = left > 0 ? `{coin}${cost} {log}${cost}` : 'NONE LEFT';
        return this.showText(facesetKey(builderPortrait(g.data.builders[me.builder]!)), 'NEW FIGHTERS', `${SLOT_KEYS[REROLL_SLOT]}: ${price}`, `REROLLS ALL SIX\n${left}/${r.prophet.rerolls} LEFT`);
      } else {
        const id = me.fighters[h.index];
        const how = g.phase === 'build' ? '' : 'BUILD AFTER WAVE';
        if (id) return this.showUnit(id, `TIER ${h.index + 1}  {coin}${g.data.units[id]?.goldCost}`, 'fighter', how);
      }
    }
    if (h?.on === 'mode') {
      if (h.mode === 'build') return this.showText('icon-coin', 'BUILD', '1/2: SWITCH', 'FIGHTERS FOR {coin}GOLD\nPLACED BETWEEN WAVES');
      return this.showText('icon-log', 'SEND', '1/2: SWITCH', 'UNITS FOR {log}LUMBER\nJOIN THE FOE WAVE\nAND RAISE INCOME');
    }
    if (h?.on === 'page') {
      const pages = Math.ceil(Object.keys(g.data.mercs).length / SEND_PAGE_SIZE);
      return this.showText('icon-log', 'MORE SENDS', `PAGE ${s.sendPage + 1}/${pages}`, '2 OR N: NEXT PAGE');
    }
    if (h?.on === 'chart') {
      return this.showText(ARMOR_ICON, 'DAMAGE TYPES', 'T: OPEN CHART', 'ATTACK TYPE VS\nARMOR TYPE DECIDES\nHOW HARD A HIT IS');
    }
    if (h?.on === 'worker') {
      return this.showText('btn-worker', `WISP ${me.workers}/${r.maxWorkers}`, `{coin}${r.workerCost}`, `GATHERS {log}${r.lumberPerWorker} LUMBER\nEVERY ${r.lumberIntervalMs / 1000}S`);
    }
    if (h?.on === 'farm') {
      const farm = r.farms[me.farmLevel];
      const food = `SUPPLY {food}${g.foodUsed(this.player)}/${me.foodCap}`;
      if (!farm) return this.showText('btn-farm', 'FARM', 'MAXED', food);
      return this.showText('btn-farm', 'FARM', `{coin}${farm.gold} {log}${farm.lumber}`, `LV ${me.farmLevel}/${r.farms.length}\n+{food}${farm.food} SUPPLY\n${food}`);
    }
    if (h?.on === 'king') {
      const k = KING_BUTTONS.find((b) => b.stat === h.stat)!;
      const lvl = g.kingLevels[me.team][h.stat];
      const gain = h.stat === 'hp' ? `+${r.king.hpBase + r.king.hpStep * (lvl + 1)} MAX HP` : h.stat === 'attack' ? `+${r.king.attackStep} DAMAGE` : `+${r.king.regenStep} HP/SEC`;
      return this.showText(k.icon, k.title, `LV ${lvl}/${this.kingMax(h.stat)}  {log}${r.king.upgradeLumber}`, `${gain}\n+${r.king.upgradeIncome} INCOME`);
    }
    if (h?.on === 'action' && selected) {
      const t = this.actionTargets[h.index];
      if (t?.kind === 'upgrade') return this.showUnit(t.to, `UPGRADE {coin}${g.data.units[t.to]?.goldCost}`, 'fighter', '');
    }
    if (h?.on === 'wave' || this.wavePinned) return this.showWave(this.nextWave(), true);
    // The armed fighter: on touch there is no hover over its slot to show it.
    const armed = s.slotMode === 'build' && s.selectedBuild !== null ? me.fighters[s.selectedBuild] : undefined;
    if (armed && !hoveredOther) return this.showUnit(armed, `TIER ${s.selectedBuild! + 1}  {coin}${g.data.units[armed]?.goldCost}`, 'fighter', TOUCH ? 'TAP A SPOT TWICE' : '');
    const hovered = hoveredOther ? g.units.get(s.hoverUnit!) : undefined;
    const live = hovered ?? selected;
    if (live) return this.showLive(live);
    // Idle: preview the wave that is coming (or running).
    if (!g.data.waves[g.wave - 1]) {
      const help = TOUCH ? 'TAP SLOT, TAP GRID\nTWICE TO BUILD\nHOLD BUTTON: INFO\nSWIPE: MOVE VIEW' : 'QWER ASDF YXCV\n1 BUILD  2 SEND\nT: DAMAGE CHART\nCLICK UNIT: SELECT';
      return this.showText('icon-hand', 'COMMANDS', '', help);
    }
    this.showWave(g.wave, false);
  }

  /** The wave still to come: the current one between waves, the following one while fighting. */
  private nextWave(): number {
    return this.game.phase === 'build' ? this.game.wave : this.game.wave + 1;
  }

  /** Creep, count and bounty of wave `n`; `numbered` labels it "W12" instead of NEXT/NOW. */
  private showWave(n: number, numbered: boolean): void {
    const g = this.game;
    const wave = g.data.waves[n - 1];
    if (!wave) return this.showText('icon-hand', 'LAST WAVE', '', 'NO MORE WAVES\nAFTER THIS ONE');
    const creep = g.data.units[wave.creep]!;
    const label = numbered ? `W${n}` : g.phase === 'build' ? 'NEXT' : 'NOW';
    const bounty = wave.endless ? 'ENDLESS FINALE!' : creep.boss ? `BOSS! BOUNTY {coin}${creep.bounty}` : `BOUNTY {coin}${creep.bounty}`;
    this.showUnit(wave.creep, `${label} ${wave.count}X ${Math.round(creep.hp * g.data.rules.creepHpMultiplier)}HP`, 'attacker', bounty);
  }

  private showLive(u: UnitState): void {
    const g = this.game;
    const owner = g.players[u.owner];
    const role =
      u.kind === 'king' ? 'KING' : u.kind === 'merc' ? 'SEND' : u.kind === 'creep' ? 'CREEP' : u.owner === this.player ? 'YOURS' : owner?.name.toUpperCase() ?? '';
    const refund = u.fresh ? u.invested : Math.floor(u.invested * g.data.rules.sellRefund);
    const note = u.leaked ? 'LEAKED!' : u.kind === 'fighter' && u.owner === this.player && g.phase !== 'build' ? `SELL {coin}${refund} LATER` : '';
    const compare: Role = u.kind === 'fighter' ? 'fighter' : u.kind === 'king' ? 'none' : 'attacker';
    this.showUnit(u.def, `${role} ${Math.ceil(u.hp)}/${u.maxHp}`, compare, note, u);
  }

  private showUnit(id: string, sub: string, role: Role, body: string, live?: UnitState): void {
    const d = this.game.data.units[id]!;
    const king = live?.kind === 'king';
    this.setPortrait(king ? 'btn-hp' : facesetKey(id));
    this.infoName.setText(d.name.toUpperCase());
    this.infoSub.set(richText(sub, 0xc0c8f0));
    this.stats.setVisible(true);
    this.setStats(d, live);
    const atk = ATTACK_INFO[d.attack.type];
    const arm = ARMOR_INFO[d.armorType];
    this.types.set([
      { icon: atk.icon, tint: atk.color },
      { text: atk.name, color: atk.color, gap: 12 },
      { icon: ARMOR_ICON, tint: arm.color },
      { text: arm.name, color: arm.color },
    ]);
    this.matchup.set(this.compare(d, role));
    const abilities = [...(d.abilities ?? []), ...(live?.granted ?? [])].map(describeAbility);
    const lines = [...abilities, ...body.split('\n')].filter(Boolean);
    this.setBody(250, lines.slice(0, 2));
  }

  /**
   * Fighters: damage dealt to and taken from the current/coming wave.
   * Creeps and sends: the attack types that hit them hardest.
   */
  private compare(d: UnitDef, role: Role): Segment[] {
    const table = this.game.data.damageTable;
    if (role === 'fighter') {
      const wave = this.game.data.waves[this.game.wave - 1];
      const creep = wave ? this.game.data.units[wave.creep] : undefined;
      if (!creep) return [];
      const deal = table[d.attack.type][creep.armorType];
      const take = table[creep.attack.type][d.armorType];
      return [
        { text: 'DEAL', color: 0xc0c8f0 },
        { text: pct(deal), color: multiplierColor(deal), gap: 8 },
        { text: 'TAKE', color: 0xc0c8f0 },
        { text: pct(take), color: multiplierColor(1 / take) },
      ];
    }
    if (role === 'attacker') {
      const weak = ATTACK_ORDER.map((t) => ({ t, m: table[t][d.armorType] }))
        .filter((x) => x.m > 1.001)
        .sort((a, b) => b.m - a.m)
        .slice(0, 2);
      if (!weak.length) return [{ text: 'NO WEAKNESS', color: 0xc0c8f0 }];
      return [{ text: 'WEAK:', color: 0xc0c8f0 }, ...weak.map(({ t }) => ({ text: ATTACK_INFO[t].name, color: ATTACK_INFO[t].color, gap: 6 }))];
    }
    return [];
  }

  private showText(icon: string, name: string, sub: string, body: string): void {
    this.setPortrait(icon);
    this.infoName.setText(name);
    this.infoSub.set(richText(sub, 0xc0c8f0));
    this.stats.setVisible(false);
    this.types.set([]);
    this.matchup.set([]);
    // Without stats the text can start right under the portrait.
    this.setBody(230, body.split('\n'));
  }

  private setBody(y: number, lines: string[]): void {
    this.infoBody.forEach((line, i) => {
      line.root.setY(y + i * 9);
      line.set(richText(lines[i] ?? ''));
    });
  }

  /** Definition stats, or a live unit's actual max HP and bonuses; damage and armor in their type colours. */
  private setStats(d: UnitDef, live?: UnitState): void {
    const [hp, dmg, arm, rng] = this.statText;
    const atk = ATTACK_INFO[d.attack.type];
    const armColor = ARMOR_INFO[d.armorType].color;
    this.statIcons[1]!.setTexture(atk.icon).setTint(atk.color);
    this.statIcons[2]!.setTexture(ARMOR_ICON).setTint(armColor);
    const bonus = live?.mods.damage ?? 0;
    hp!.setText(String(live ? live.maxHp : d.hp));
    dmg!.setText(`${d.attack.damage[0] + bonus}-${d.attack.damage[1] + bonus}`).setTint(atk.color);
    arm!.setText(String(d.armor + (live?.mods.armor ?? 0))).setTint(armColor);
    rng!.setText(String(d.attack.range));
  }

  private setPortrait(key: string): void {
    if (key === this.portraitState) return;
    this.portraitState = key;
    // Small icons sit centred in the portrait box.
    const small = !key.endsWith('-Face');
    this.portrait.setTexture(key).setOrigin(small ? 0.5 : 0, small ? 0.5 : 0).setPosition(small ? 205 : 186, small ? 209 : 190);
  }

  private updateActions(unit: UnitState | undefined): void {
    this.actionTargets = [];
    if (unit) {
      for (const to of this.game.def(unit).upgradesTo ?? []) this.actionTargets.push({ kind: 'upgrade', to });
      this.actionTargets.push({ kind: 'sell' });
    }
    const me = this.game.players[this.player]!;
    this.actions.forEach((b, i) => {
      const t = this.actionTargets[i];
      b.setVisible(!!t);
      if (!t || !unit) return;
      if (t.kind === 'upgrade') {
        const cost = this.game.data.units[t.to]?.goldCost ?? 0;
        b.setContent('btn-upgrade', String(cost), { costIcon: 'icon-coin', corner: i === 0 ? 'U' : '', labelColor: me.gold >= cost ? 0xffffff : 0xff7070 });
        b.setState(me.gold >= cost);
      } else {
        const refund = unit.fresh ? unit.invested : Math.floor(unit.invested * this.game.data.rules.sellRefund);
        b.setContent('btn-sell', String(refund), { costIcon: 'icon-coin', corner: 'DEL' }).setState(true);
      }
    });
    // Leave room for the action buttons below the stats.
    this.infoBody.forEach((line) => line.setVisible(!unit));
    this.types.setVisible(!unit);
    this.matchup.setVisible(!unit);
  }

  private runAction(i: number): void {
    const t = this.actionTargets[i];
    if (t?.kind === 'upgrade') this.act.upgrade(t.to);
    else if (t?.kind === 'sell') this.act.sell();
  }

  private kingMax(stat: KingStat): number {
    const k = this.game.data.rules.king;
    return stat === 'hp' ? k.hpMax : stat === 'attack' ? k.attackMax : k.regenMax;
  }

  // ---- top bar ------------------------------------------------------------------

  private drawTop(s: HudState): void {
    const g = this.game;
    const secs = Math.max(0, Math.ceil((g.phaseEndsAtMs - g.timeMs) / 1000));
    const phase = g.phase === 'build' ? `BUILD ${secs}s` : g.phase === 'fight' ? 'FIGHT!' : g.phase === 'arena' ? 'ARENA!' : 'GAME OVER';
    this.topText.setText(`WAVE ${g.wave}/${g.data.waves.length}\n${phase}`);
    const myTeam = g.players[this.player]!.team;
    const bars = this.kingBars.clear();
    const attackers = this.attackersAlive();
    ([myTeam, myTeam === 0 ? 1 : 0] as const).forEach((team, row) => {
      const k = g.king(team);
      // A king losing HP makes its view tab blink.
      if (k.hp < this.lastKingHp[team]) this.tabs.forEach((t, i) => this.views[i]!.kingTeam === team && t.flash());
      this.lastKingHp[team] = k.hp;
      const { x, w } = KING_BAR;
      const y = 6 + row * 10;
      bars.fillStyle(0x000000, 0.7).fillRect(x, y, w, 5);
      bars.fillStyle(team === 0 ? 0x60a0ff : 0xff6060, 1).fillRect(x + 1, y + 1, Math.ceil((w - 2) * (k.hp / k.maxHp)), 3);
      // Who clears the wave faster: enemies left on this team's lanes and at its king.
      const n = attackers[team];
      this.alive[row]!.setText(g.phase === 'build' ? '' : `${n}`).setTint(n ? 0xffffff : 0x80ff90);
    });
    this.tabs.forEach((t, i) => t.setActive(this.views[i]!.areas.includes(s.viewArea)));
    this.drawWaveButton();
  }

  /** Creep of the next wave with its number and count. */
  private drawWaveButton(): void {
    const g = this.game;
    const n = this.nextWave();
    const wave = g.data.waves[n - 1];
    const b = this.waveButton;
    b.bg.setTexture(this.wavePinned ? b.textures.slotActive : this.hover?.on === 'wave' ? b.textures.slotHover : b.textures.slot);
    const state = `${n}`;
    if (state === this.waveButtonState) return;
    this.waveButtonState = state;
    const spec = wave ? UNIT_SPRITES[wave.creep] : undefined;
    b.icon.setVisible(!!spec);
    if (spec) b.icon.setTexture(spec.kind === 'character' ? `${spriteKey(spec)}-Idle` : `${spriteKey(spec)}-Walk`, DIR.left);
    b.text.setText(wave ? `W${n}\n${wave.count}X` : 'END');
  }

  /** Every gold or lumber gain (bounty, income, wisps, refund) rises as "+N" next to its counter. */
  private popRes(kind: keyof typeof RES_POP, value: number): void {
    const now = this.scene.time.now;
    const p = this.resPop[kind];
    if (p.last !== null && value > p.last) {
      if (!p.pending) p.since = now;
      p.pending += value - p.last;
    }
    p.last = value;
    if (!p.pending || now - p.since < RES_POP_MS) return;
    const x = RES_POP[kind].x + String(value).length * 8 + 4;
    const t = this.scene.add.bitmapText(x, 190, FONT, `+${p.pending}`).setTint(RES_POP[kind].tint).setDepth(10);
    this.scene.tweens.add({ targets: t, y: 182, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
    p.pending = 0;
  }

  /** Live creeps and sends per defending team, by the area they are in (lanes and king arenas). */
  private attackersAlive(): Record<TeamId, number> {
    const g = this.game;
    const count: Record<TeamId, number> = { 0: 0, 1: 0 };
    const arenas: Record<number, TeamId> = { [g.arenaOf(0)]: 0, [g.arenaOf(1)]: 1 };
    for (const u of g.units.values()) {
      if (u.dead || (u.kind !== 'creep' && u.kind !== 'merc')) continue;
      const team = g.isLane(u.area) ? g.players[u.area]?.team : arenas[u.area];
      if (team !== undefined) count[team]++;
    }
    return count;
  }
}
