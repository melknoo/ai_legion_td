import Phaser from 'phaser';
import { describeAbility, type GameView, type KingStat, type TeamId, type UnitDef, type UnitState } from '@legion/shared';
import { UNIT_SPRITES, spriteKey } from '../assets/manifest.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { RichLine, type Segment } from './RichLine.ts';
import { MiniButton, SlotButton, TabButton } from './SlotButton.ts';
import { ARMOR_ICON, ARMOR_INFO, ATTACK_INFO, ATTACK_ORDER, multiplierColor } from './typeInfo.ts';

/** What the six slots offer: fighters for gold or sends for lumber. */
export type SlotMode = 'build' | 'send';

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
  | { on: 'king'; stat: KingStat };

/** How the info panel compares a unit: a fighter against the wave, an attacker by its weak spots. */
type Role = 'fighter' | 'attacker' | 'none';

export function facesetKey(unitId: string): string {
  const spec = UNIT_SPRITES[unitId];
  return spec ? `${spriteKey(spec)}-Face` : '__DEFAULT';
}

const pct = (m: number) => `${Math.round(m * 100)}%`;

/** Bottom command panels and top status bar, mouse and keyboard driven. */
export class Hud {
  private hover: Hover | null = null;
  private readonly topText: Phaser.GameObjects.BitmapText;
  private readonly tabs: TabButton[];
  private readonly kingBars: Phaser.GameObjects.Graphics;
  private readonly lastKingHp: Record<TeamId, number> = { 0: Infinity, 1: Infinity };
  private readonly slots: SlotButton[];
  private readonly modeButtons: Record<SlotMode, MiniButton>;
  private readonly pageButton: MiniButton;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly portraitHue: Phaser.Filters.ColorMatrix;
  private readonly infoName: Phaser.GameObjects.BitmapText;
  private readonly infoSub: Phaser.GameObjects.BitmapText;
  private readonly stats: Phaser.GameObjects.Container;
  private readonly statIcons: Phaser.GameObjects.Image[];
  private readonly statText: Phaser.GameObjects.BitmapText[];
  private readonly types: RichLine;
  private readonly matchup: RichLine;
  private readonly infoBody: Phaser.GameObjects.BitmapText;
  private readonly actions: SlotButton[];
  private actionTargets: ({ kind: 'upgrade'; to: string } | { kind: 'sell' })[] = [];
  private readonly res: Record<'gold' | 'lumber' | 'income' | 'food', Phaser.GameObjects.BitmapText>;
  private readonly worker: SlotButton;
  private readonly farm: SlotButton;
  private readonly kingButtons: SlotButton[];
  private portraitState = '';

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
    scene.add.bitmapText(252, 4, FONT, 'MY').setTint(myTeam === 0 ? 0x80b0ff : 0xff8080);
    scene.add.bitmapText(252, 14, FONT, 'FOE').setTint(myTeam === 0 ? 0xff8080 : 0x80b0ff);
    this.kingBars = scene.add.graphics();

    // Bottom panels (y 186..270). Left: build / send slots plus a column of mode buttons.
    ff6Window(scene, 2, 186, 178, 84);
    this.slots = Array.from({ length: 6 }, (_, i) =>
      new SlotButton(scene, {
        x: 5 + (i % 3) * 53,
        y: 189 + Math.floor(i / 3) * 40,
        w: 52,
        h: 39,
        iconY: 0,
        onClick: () => act.pickSlot(i),
        onHover: hoverFn({ on: 'slot', index: i }),
      }),
    );
    const mini = (y: number, icon: { icon?: string; text?: string }, onClick: () => void, hover: Hover) =>
      new MiniButton(scene, { x: 164, y, size: 13, ...icon, onClick, onHover: hoverFn(hover) });
    this.modeButtons = {
      build: mini(189, { icon: 'icon-coin' }, () => act.setSlotMode('build'), { on: 'mode', mode: 'build' }),
      send: mini(203, { icon: 'icon-log' }, () => act.setSlotMode('send'), { on: 'mode', mode: 'send' }),
    };
    this.pageButton = mini(222, { text: '>' }, () => act.nextSendPage(), { on: 'page' });
    mini(254, { text: '?' }, () => act.toggleTypeChart(), { on: 'chart' });
    this.hand = scene.add.image(0, 0, 'icon-hand').setOrigin(1, 0.5).setDepth(1);
    scene.tweens.add({ targets: this.hand, x: '-=2', duration: 300, yoyo: true, repeat: -1 });

    // Middle: info / tooltip.
    ff6Window(scene, 182, 186, 156, 84);
    this.portrait = scene.add.image(186, 190, '__DEFAULT').setOrigin(0, 0);
    this.portraitHue = this.portrait.enableFilters().filters!.internal.addColorMatrix();
    this.infoName = scene.add.bitmapText(228, 190, FONT, '');
    this.infoSub = scene.add.bitmapText(228, 199, FONT, '').setTint(0xc0c8f0);
    // HP, damage (attack type icon), armor (armor type icon), range.
    this.statIcons = ['icon-heart', 'icon-sword', 'icon-shield', 'icon-range'].map((key, i) =>
      scene.add.image(228 + (i % 2) * 52, 209 + Math.floor(i / 2) * 10, key).setOrigin(0, 0),
    );
    this.statText = this.statIcons.map((_, i) => scene.add.bitmapText(238 + (i % 2) * 52, 210 + Math.floor(i / 2) * 10, FONT, ''));
    this.stats = scene.add.container(0, 0, [...this.statIcons, ...this.statText]);
    this.types = new RichLine(scene, 187, 230);
    this.matchup = new RichLine(scene, 187, 240);
    this.infoBody = scene.add.bitmapText(187, 250, FONT, '').setLineSpacing(1);
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
    this.res = {
      gold: scene.add.bitmapText(356, 190, FONT, ''),
      lumber: scene.add.bitmapText(418, 190, FONT, ''),
      income: scene.add.bitmapText(346, 201, FONT, ''),
      food: scene.add.bitmapText(408, 201, FONT, ''),
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

  update(s: HudState): void {
    const g = this.game;
    const me = g.players[this.player]!;
    this.drawTop(s);

    // Slots: fighters for gold, or sends for lumber (build phase: either, wave: sends only).
    const send = s.slotMode === 'send';
    const open = g.phase === 'build' || g.phase === 'fight';
    const builder = g.data.builders[me.builder]!;
    const sends = Object.values(g.data.mercs);
    const pages = Math.ceil(sends.length / 6);
    this.modeButtons.build.setState(g.phase === 'build', !send);
    this.modeButtons.send.setState(open, send);
    this.pageButton.setVisible(send && open && pages > 1);
    this.hand.setVisible(false);
    const wave = g.data.waves[g.wave - 1];
    const creep = wave ? g.data.units[wave.creep] : undefined;
    this.slots.forEach((slot, i) => {
      if (send) {
        const merc = sends[s.sendPage * 6 + i];
        slot.setVisible(!!merc && open);
        if (!merc) return;
        // Advanced sends stay locked until their wave.
        const locked = g.wave < (merc.minWave ?? 0);
        const ok = !locked && me.lumber >= merc.lumberCost;
        slot.setContent(facesetKey(merc.unit), locked ? `W${merc.minWave}` : String(merc.lumberCost), {
          hue: UNIT_SPRITES[merc.unit]?.hue,
          corner: String(i + 1),
          costIcon: locked ? undefined : 'icon-log',
          labelColor: ok || locked ? 0xffffff : 0xff7070,
          badges: this.badges(g.data.units[merc.unit]!),
        });
        slot.setState(ok);
        return;
      }
      const id = builder.fighters[i];
      slot.setVisible(!!id && g.phase === 'build');
      if (!id) return;
      const d = g.data.units[id]!;
      const cost = d.goldCost ?? 0;
      const ok = me.gold >= cost;
      const active = i === s.selectedBuild;
      // The badge backing hints whether this attack type suits the coming wave.
      const vs = creep ? g.data.damageTable[d.attack.type][creep.armorType] : 1;
      slot.setContent(facesetKey(id), String(cost), {
        hue: UNIT_SPRITES[id]?.hue,
        corner: String(i + 1),
        costIcon: 'icon-coin',
        labelColor: ok ? 0xffffff : 0xff7070,
        badges: this.badges(d),
        badgeBg: vs > 1.001 ? 0x1c6a28 : vs < 0.999 ? 0x7a2020 : undefined,
      });
      slot.setState(ok, active);
      if (active) this.hand.setVisible(true).setPosition(slot.root.x + 2, slot.root.y + 20);
    });

    // Resources and upgrade buttons.
    this.res.gold.setText(String(me.gold));
    this.res.lumber.setText(String(me.lumber));
    this.res.income.setText(`INC+${me.income}`);
    this.res.food.setText(`F:${g.foodUsed(this.player)}/${me.foodCap}`);
    const r = g.data.rules;
    this.worker.setContent('btn-worker', `${me.workers}`, { corner: 'B' }).setState(me.gold >= r.workerCost && me.workers < r.maxWorkers);
    const farm = r.farms[me.farmLevel];
    this.farm.setContent('btn-farm', `${me.farmLevel}`, { corner: 'F' }).setState(!!farm && me.gold >= farm.gold && me.lumber >= farm.lumber);
    this.kingButtons.forEach((b, i) => {
      const k = KING_BUTTONS[i]!;
      const lvl = g.kingLevels[me.team][k.stat];
      b.setContent(k.icon, `${lvl}`, { corner: k.key }).setState(me.lumber >= r.king.upgradeLumber && lvl < this.kingMax(k.stat));
    });

    this.drawInfo(s);
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
    const selected = s.selectedUnit !== null ? g.units.get(s.selectedUnit) : undefined;
    const ownFighter = selected?.kind === 'fighter' && selected.owner === this.player ? selected : undefined;
    // Hovering the selected unit itself must not hide its upgrade/sell buttons.
    const hoveredOther = s.hoverUnit !== null && s.hoverUnit !== s.selectedUnit;
    const showActions = !!ownFighter && g.phase === 'build' && (!h || h.on === 'action') && !hoveredOther;
    this.updateActions(showActions ? ownFighter : undefined);

    if (h?.on === 'slot') {
      if (s.slotMode === 'send') {
        const merc = Object.values(g.data.mercs)[s.sendPage * 6 + h.index];
        // Build-phase sends join the coming wave, sends during a wave the one after.
        const joins = g.phase === 'build' ? g.wave : g.wave + 1;
        if (merc) return this.showUnit(merc.unit, `SEND ${merc.lumberCost}L`, 'attacker', `+${merc.incomeGain} INCOME\nJOINS WAVE ${joins}`);
      } else {
        const id = g.data.builders[me.builder]!.fighters[h.index];
        if (id) return this.showUnit(id, `TIER ${h.index + 1}  ${g.data.units[id]?.goldCost}G`, 'fighter', 'CLICK, THEN PLACE\nSHIFT: PLACE MANY');
      }
    }
    if (h?.on === 'mode') {
      if (h.mode === 'build') return this.showText('icon-coin', 'BUILD', 'Q: SWITCH', 'FIGHTERS FOR GOLD\nONLY BETWEEN WAVES');
      return this.showText('icon-log', 'SEND', 'Q: SWITCH', 'UNITS FOR LUMBER\nJOIN THE FOE WAVE\nAND RAISE INCOME');
    }
    if (h?.on === 'page') {
      const pages = Math.ceil(Object.keys(g.data.mercs).length / 6);
      return this.showText('icon-log', 'MORE SENDS', `PAGE ${s.sendPage + 1}/${pages}`, 'N: NEXT PAGE');
    }
    if (h?.on === 'chart') {
      return this.showText(ARMOR_ICON, 'DAMAGE TYPES', 'T: OPEN CHART', 'ATTACK TYPE VS\nARMOR TYPE DECIDES\nHOW HARD A HIT IS');
    }
    if (h?.on === 'worker') {
      return this.showText('btn-worker', `WISP ${me.workers}/${r.maxWorkers}`, `${r.workerCost}G`, `GATHERS ${r.lumberPerWorker} LUMBER\nEVERY ${r.lumberIntervalMs / 1000}S`);
    }
    if (h?.on === 'farm') {
      const farm = r.farms[me.farmLevel];
      const food = `FOOD ${g.foodUsed(this.player)}/${me.foodCap}`;
      if (!farm) return this.showText('btn-farm', 'FARM', 'MAXED', food);
      return this.showText('btn-farm', 'FARM', `LV ${me.farmLevel}/${r.farms.length} ${farm.gold}G ${farm.lumber}L`, `+${farm.food} FOOD\n${food}`);
    }
    if (h?.on === 'king') {
      const k = KING_BUTTONS.find((b) => b.stat === h.stat)!;
      const lvl = g.kingLevels[me.team][h.stat];
      const gain = h.stat === 'hp' ? `+${r.king.hpBase + r.king.hpStep * (lvl + 1)} MAX HP` : h.stat === 'attack' ? `+${r.king.attackStep} DAMAGE` : `+${r.king.regenStep} HP/SEC`;
      return this.showText(k.icon, k.title, `LV ${lvl}/${this.kingMax(h.stat)}  ${r.king.upgradeLumber}L`, `${gain}\n+${r.king.upgradeIncome} INCOME`);
    }
    if (h?.on === 'action' && selected) {
      const t = this.actionTargets[h.index];
      if (t?.kind === 'upgrade') return this.showUnit(t.to, `UPGRADE ${g.data.units[t.to]?.goldCost}G`, 'fighter', '');
    }
    const hovered = hoveredOther ? g.units.get(s.hoverUnit!) : undefined;
    const live = hovered ?? selected;
    if (live) return this.showLive(live);
    // Idle: preview the wave that is coming (or running).
    const wave = g.data.waves[g.wave - 1];
    if (!wave) return this.showText('icon-hand', 'COMMANDS', '', '1-6 BUILD/SEND\nQ: BUILD/SEND MODE\nT: DAMAGE CHART\nCLICK UNIT: SELECT');
    const creep = g.data.units[wave.creep]!;
    const label = g.phase === 'build' ? 'NEXT' : 'NOW';
    this.showUnit(wave.creep, `${label} ${wave.count}X ${Math.round(creep.hp * r.creepHpMultiplier)}HP`, 'attacker', wave.endless ? 'ENDLESS FINALE!' : creep.boss ? `BOSS! BOUNTY ${creep.bounty}` : `BOUNTY ${creep.bounty} GOLD`);
  }

  private showLive(u: UnitState): void {
    const g = this.game;
    const owner = g.players[u.owner];
    const role =
      u.kind === 'king' ? 'KING' : u.kind === 'merc' ? 'SEND' : u.kind === 'creep' ? 'CREEP' : u.owner === this.player ? 'YOURS' : owner?.name.toUpperCase() ?? '';
    const refund = u.fresh ? u.invested : Math.floor(u.invested * g.data.rules.sellRefund);
    const note = u.leaked ? 'LEAKED!' : u.kind === 'fighter' && u.owner === this.player && g.phase !== 'build' ? `SELL ${refund}G LATER` : '';
    const compare: Role = u.kind === 'fighter' ? 'fighter' : u.kind === 'king' ? 'none' : 'attacker';
    this.showUnit(u.def, `${role} ${Math.ceil(u.hp)}/${u.maxHp}`, compare, note, u);
  }

  private showUnit(id: string, sub: string, role: Role, body: string, live?: UnitState): void {
    const d = this.game.data.units[id]!;
    const king = live?.kind === 'king';
    this.setPortrait(king ? 'btn-hp' : facesetKey(id), king ? 0 : UNIT_SPRITES[id]?.hue ?? 0);
    this.infoName.setText(d.name.toUpperCase());
    this.infoSub.setText(sub);
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
    this.infoBody.setY(250).setText(lines.slice(0, 2).join('\n'));
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
    this.setPortrait(icon, 0);
    this.infoName.setText(name);
    this.infoSub.setText(sub);
    this.stats.setVisible(false);
    this.types.set([]);
    this.matchup.set([]);
    // Without stats the text can start right under the portrait.
    this.infoBody.setY(230).setText(body);
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

  private setPortrait(key: string, hue: number): void {
    const state = `${key}:${hue}`;
    if (state === this.portraitState) return;
    this.portraitState = state;
    // Small icons sit centred in the portrait box.
    const small = !key.endsWith('-Face');
    this.portrait.setTexture(key).setOrigin(small ? 0.5 : 0, small ? 0.5 : 0).setPosition(small ? 205 : 186, small ? 209 : 190);
    this.portraitHue.colorMatrix.reset();
    if (hue) this.portraitHue.colorMatrix.hue(hue);
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
        b.setContent('btn-sell', String(refund), { costIcon: 'icon-coin', corner: 'S' }).setState(true);
      }
    });
    // Leave room for the action buttons below the stats.
    this.infoBody.setVisible(!unit);
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
    ([myTeam, myTeam === 0 ? 1 : 0] as const).forEach((team, row) => {
      const k = g.king(team);
      // A king losing HP makes its view tab blink.
      if (k.hp < this.lastKingHp[team]) this.tabs.forEach((t, i) => this.views[i]!.kingTeam === team && t.flash());
      this.lastKingHp[team] = k.hp;
      const x = 280;
      const y = 5 + row * 10;
      bars.fillStyle(0x000000, 0.7).fillRect(x, y, 194, 6);
      bars.fillStyle(team === 0 ? 0x60a0ff : 0xff6060, 1).fillRect(x + 1, y + 1, Math.ceil(192 * (k.hp / k.maxHp)), 4);
    });
    this.tabs.forEach((t, i) => t.setActive(this.views[i]!.areas.includes(s.viewArea)));
  }
}
