import Phaser from 'phaser';
import type { GameView, PlayerState } from '@legion/shared';
import { FIELD_H, FIELD_TOP, HUD_H, HUD_Y, VIEW_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { MINIMAP_BOX } from './Minimap.ts';
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
const GOLD = { x: 94, y: 2, w: 108, h: 21 };
/** The command card's tabs, 1 to 3. */
const tab = (i: number) => ({ x: 4, y: HUD_Y + 2 + i * 24, w: 46, h: 25 });

/** Shown in this order, each once its game state comes up. */
const TIPS: Tip[] = [
  {
    id: 'build',
    lines: ['PICK FIGHTER, CLICK GRID'],
    touch: ['TAP FIGHTER, TAP GRID'],
    spot: { x: 2, y: HUD_Y, w: 207, h: HUD_H },
    when: building,
  },
  { id: 'timer', lines: ['WAVE STARTS AT 0'], spot: { x: 2, y: 1, w: 80, h: 23 }, when: building },
  { id: 'gold', lines: ['GOLD BUYS FIGHTERS'], spot: GOLD, when: building },
  { id: 'wisps', lines: ['WISPS (3) GATHER LUMBER'], touch: ['WISPS (KING) GET LUMBER'], spot: tab(2), when: building },
  { id: 'sends', lines: ['SENDS (2) RAISE INCOME'], touch: ['SENDS RAISE INCOME'], spot: tab(1), when: building },
  { id: 'leak', lines: ['GUARD THE RED LINE'], spot: FIELD, when: fighting },
  { id: 'kings', lines: ['KING HP, ENEMIES LEFT'], spot: { x: 250, y: 2, w: 228, h: 22 }, when: fighting },
  { id: 'map', lines: ['CLICK MAP: OTHER LANES'], touch: ['TAP MAP: OTHER LANES'], spot: MINIMAP_BOX, when: fighting },
  {
    id: 'select',
    lines: ['CLICK FIGHTER: UPGRADE (U)'],
    touch: ['TAP FIGHTER: UPGRADE'],
    spot: { x: 211, y: HUD_Y, w: 213, h: HUD_H },
    when: (g) => building(g) && g.wave >= 2,
  },
  {
    id: 'food',
    lines: ['FOOD LOW: FARM (3)'],
    touch: ['FOOD LOW: FARM (KING)'],
    spot: tab(2),
    when: (g, me) => building(g) && g.foodUsed(me.index) >= me.foodCap - 2,
  },
  {
    id: 'king',
    lines: ['KING UPGRADES (3)'],
    touch: ['UPGRADE YOUR KING'],
    spot: tab(2),
    when: (g, me) => building(g) && g.wave >= 3 && me.lumber >= g.data.rules.king.upgradeLumber,
  },
];

/** One-off hints that jump the queue when their situation comes up. */
const NUDGES: Tip[] = [
  {
    id: 'unspent',
    lines: ['SPEND YOUR GOLD!'],
    spot: GOLD,
    when: (g, me) => building(g) && !g.arenaNext && g.phaseEndsAtMs - g.timeMs < 15_000 && me.gold >= cheapestFighter(g, me),
  },
  {
    id: 'leaked',
    lines: ['LEAKED! CHECK TYPES (T)'],
    touch: ['LEAKED! CHECK TYPES (?)'],
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
