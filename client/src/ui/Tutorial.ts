import Phaser from 'phaser';
import type { GameView, PlayerState } from '@legion/shared';
import { FIELD_H, FIELD_TOP, VIEW_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { TOUCH } from './touch.ts';

const TIPS_KEY = 'legion.tips';
/** Bumped when tips are switched back on, so a running game starts them over. */
let restarts = 0;

/** Whether first-game tips are on; they stay on until the player ticks them off. */
export function tipsEnabled(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTipsEnabled(on: boolean): void {
  if (on && !tipsEnabled()) restarts++;
  try {
    localStorage.setItem(TIPS_KEY, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this page only.
  }
}

interface Tip {
  id: string;
  lines: string[];
  /** Wording for touch screens, where the tip names keys or the mouse. */
  touch?: string[];
  /** HUD area the tip is about, outlined while it shows (layout pixels). */
  spot: { x: number; y: number; w: number; h: number };
  when: (g: GameView, me: PlayerState) => boolean;
}

const building = (g: GameView) => g.phase === 'build';
const fighting = (g: GameView) => g.phase === 'fight';
const FIELD = { x: 2, y: FIELD_TOP, w: 476, h: FIELD_H };
const GOLD = { x: 340, y: 186, w: 138, h: 24 };

/** Shown in this order, each once its game state comes up. */
const TIPS: Tip[] = [
  {
    id: 'build',
    lines: ['BUILD FIGHTERS: PICK ONE ON THE', 'COMMAND CARD (OR Q-V), THEN CLICK', 'A FREE SPOT ON YOUR GRID.'],
    touch: ['BUILD FIGHTERS: TAP ONE ON THE', 'COMMAND CARD, THEN TAP A FREE', 'SPOT TWICE. HOLD A BUTTON: INFO.'],
    spot: { x: 2, y: 186, w: 178, h: 84 },
    when: building,
  },
  {
    id: 'timer',
    lines: ['THE TIMER COUNTS DOWN THE BUILD', 'PHASE. AT 0 THE WAVE STARTS BY', 'ITSELF - BE READY!'],
    spot: { x: 2, y: 1, w: 80, h: 23 },
    when: building,
  },
  { id: 'gold', lines: ['GOLD BUYS FIGHTERS. AFTER EACH', 'WAVE YOU GET YOUR INCOME.'], spot: GOLD, when: building },
  {
    id: 'wisps',
    lines: ['WISPS (B) GATHER LUMBER. LUMBER', 'PAYS FOR SENDS AND KING UPGRADES.'],
    touch: ['WISPS GATHER LUMBER. LUMBER PAYS', 'FOR SENDS AND KING UPGRADES.'],
    spot: { x: 341, y: 222, w: 30, h: 46 },
    when: building,
  },
  {
    id: 'sends',
    lines: ['SENDS (2): BUY UNITS THAT ATTACK', 'THE FOE LANE NEXT WAVE. EACH ONE', 'RAISES YOUR INCOME.'],
    touch: ['SENDS: BUY UNITS THAT ATTACK', 'THE FOE LANE NEXT WAVE. EACH ONE', 'RAISES YOUR INCOME.'],
    spot: { x: 161, y: 187, w: 18, h: 30 },
    when: building,
  },
  { id: 'leak', lines: ['CREEPS PASSING THE RED LINE LEAK', 'TO YOUR KING. IF IT FALLS, YOUR', 'TEAM LOSES.'], spot: FIELD, when: fighting },
  { id: 'kings', lines: ['TOP RIGHT: KING HP OF BOTH TEAMS', 'AND HOW MANY ENEMIES ARE LEFT.'], spot: { x: 250, y: 2, w: 228, h: 22 }, when: fighting },
  {
    id: 'tabs',
    lines: ['TABS: WATCH OTHER LANES AND THE', 'KINGS. TAB STEPS, SPACE: HOME.'],
    touch: ['TABS: WATCH OTHER LANES AND THE', 'KINGS. SWIPE THE FIELD TO PAN.'],
    spot: { x: 82, y: 1, w: 166, h: 23 },
    when: fighting,
  },
  {
    id: 'select',
    lines: ['CLICK ONE OF YOUR FIGHTERS TO', 'UPGRADE (U) OR SELL IT (DEL).', 'T SHOWS THE DAMAGE TYPE CHART.'],
    touch: ['TAP ONE OF YOUR FIGHTERS TO', 'UPGRADE OR SELL IT. THE ? BUTTON', 'SHOWS THE DAMAGE TYPE CHART.'],
    spot: { x: 182, y: 186, w: 156, h: 84 },
    when: (g) => building(g) && g.wave >= 2,
  },
  {
    id: 'food',
    lines: ['YOUR FOOD IS ALMOST USED UP. FARM', 'UPGRADES (G) RAISE IT, SO YOU CAN', 'FIELD MORE FIGHTERS.'],
    touch: ['YOUR FOOD IS ALMOST USED UP. FARM', 'UPGRADES (NEXT TO THE WISP) RAISE', 'IT, SO YOU CAN FIELD MORE FIGHTERS.'],
    spot: { x: 370, y: 222, w: 28, h: 46 },
    when: (g, me) => building(g) && g.foodUsed(me.index) >= me.foodCap - 2,
  },
  {
    id: 'king',
    lines: ['KING UPGRADES (H/J/K) COST LUMBER:', 'MORE HP, ATTACK OR REGEN FOR YOUR', 'KING, AND +INCOME FOR YOU.'],
    touch: ['KING UPGRADES COST LUMBER: MORE', 'HP, ATTACK OR REGEN FOR YOUR KING,', 'AND +INCOME FOR YOU.'],
    spot: { x: 396, y: 222, w: 82, h: 46 },
    when: (g, me) => building(g) && g.wave >= 3 && me.lumber >= g.data.rules.king.upgradeLumber,
  },
];

/** One-off hints that jump the queue when their situation comes up. */
const NUDGES: Tip[] = [
  {
    id: 'unspent',
    lines: ['THE WAVE STARTS SOON AND YOU STILL', 'HAVE GOLD: BUILD OR UPGRADE NOW!'],
    spot: GOLD,
    when: (g, me) => building(g) && g.phaseEndsAtMs - g.timeMs < 15_000 && me.gold >= cheapestFighter(g, me),
  },
  {
    id: 'leaked',
    lines: ['YOU LEAKED CREEPS. BUILD OR UPGRADE', 'MORE FIGHTERS, AND CHECK WHICH', 'DAMAGE TYPES BEAT THE NEXT WAVE (T).'],
    touch: ['YOU LEAKED CREEPS. BUILD OR UPGRADE', 'MORE FIGHTERS, AND CHECK WHICH', 'DAMAGE TYPES BEAT THE NEXT WAVE (?).'],
    spot: FIELD,
    when: (g, me) => building(g) && g.wave >= 2 && me.leaks > 0,
  },
];

function cheapestFighter(g: GameView, me: PlayerState): number {
  return Math.min(...me.fighters.map((id) => g.data.units[id]?.goldCost ?? Infinity));
}

/**
 * First-game tips: one FF6 window at a time, each pointing at the HUD part it explains,
 * shown once its game state comes up, plus nudges when the player is about to waste gold or
 * leaked. A checkbox turns them off; switching them back on in the options starts them over.
 */
export class Tutorial {
  private next = 0;
  private readonly nudged = new Set<string>();
  private restarts = restarts;
  private open: Phaser.GameObjects.Container | null = null;
  private outline: Phaser.GameObjects.Container | null = null;
  private optOut = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameView,
    private readonly player: number,
  ) {}

  update(): void {
    if (this.restarts !== restarts) {
      this.restarts = restarts;
      this.next = 0;
      this.nudged.clear();
    }
    if (this.open || !tipsEnabled()) return;
    const me = this.game.players[this.player]!;
    const nudge = NUDGES.find((t) => !this.nudged.has(t.id) && t.when(this.game, me));
    if (nudge) {
      this.nudged.add(nudge.id);
      return this.show(nudge, false);
    }
    const tip = TIPS[this.next];
    if (tip?.when(this.game, me)) this.show(tip, true);
  }

  private show(tip: Tip, advances: boolean): void {
    const s = this.scene;
    const lines = (TOUCH && tip.touch) || tip.lines;
    const w = Math.max(...lines.map((l) => l.length), 24) * 8 + 16;
    const h = lines.length * 11 + 36;
    const x = Math.round((VIEW_W - w) / 2);
    // Under the field label; only the checkbox and OK take clicks, the grid below stays usable.
    const y = FIELD_TOP + 13;
    const box = ff6Window(s, 0, 0, w, h);
    const text = s.add.bitmapText(8, 7, FONT, lines.join('\n')).setLineSpacing(3);
    const rowY = h - 17;
    const check = s.add.bitmapText(8, rowY, FONT, '');
    const ok = s.add.bitmapText(w - 28, rowY, FONT, 'OK').setTint(0xfff080);
    const refresh = () => check.setText(`${this.optOut ? '[X]' : '[ ]'} NO MORE TIPS`).setTint(this.optOut ? 0xffffff : 0xc0c8f0);
    refresh();
    const zone = (zx: number, zw: number, fn: () => void) =>
      s.add
        .zone(zx, rowY - 3, zw, 13)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          e.stopPropagation();
          fn();
        });
    const checkZone = zone(4, 13 * 8, () => {
      this.optOut = !this.optOut;
      refresh();
    });
    const okZone = zone(w - 34, 28, () => this.dismiss(advances));
    this.open = s.add.container(x, y, [box, text, check, ok, checkZone, okZone]).setDepth(19000);

    // A 2 px frame just outside the spot, so it doesn't vanish into the light window borders.
    const { spot } = tip;
    const [ox, oy, ow, oh] = [spot.x - 1, spot.y - 1, spot.w + 2, spot.h + 2];
    const bar = (bx: number, by: number, bw: number, bh: number) => s.add.rectangle(bx, by, bw, bh, 0xffd040).setOrigin(0, 0);
    const outline = s.add
      .container(0, 0, [bar(ox, oy, ow, 2), bar(ox, oy + oh - 2, ow, 2), bar(ox, oy, 2, oh), bar(ox + ow - 2, oy, 2, oh)])
      .setDepth(18999);
    s.tweens.add({ targets: outline, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
    this.outline = outline;
  }

  private dismiss(advances: boolean): void {
    this.open?.destroy();
    this.outline?.destroy();
    this.open = null;
    this.outline = null;
    if (advances) this.next++;
    if (this.optOut) {
      setTipsEnabled(false);
      this.optOut = false;
    }
  }
}
