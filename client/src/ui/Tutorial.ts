import Phaser from 'phaser';
import type { GameView } from '@legion/shared';
import { FIELD_H, FIELD_TOP, VIEW_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { TOUCH } from './touch.ts';

const TIPS_KEY = 'legion.tips';

/** Whether first-game tips are on; they stay on until the player ticks them off. */
export function tipsEnabled(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTipsEnabled(on: boolean): void {
  try {
    localStorage.setItem(TIPS_KEY, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this page only.
  }
}

interface Tip {
  lines: string[];
  /** HUD area the tip is about, outlined while it shows (layout pixels). */
  spot: { x: number; y: number; w: number; h: number };
  when: (g: GameView) => boolean;
}

const building = (g: GameView) => g.phase === 'build';
const fighting = (g: GameView) => g.phase === 'fight';

/** Touch wording for the tips that name keys or the mouse, by index in TIPS. */
const TOUCH_LINES: Record<number, string[]> = {
  0: ['BUILD FIGHTERS: TAP ONE ON THE', 'COMMAND CARD, THEN TAP A FREE', 'SPOT TWICE. HOLD A BUTTON: INFO.'],
  2: ['WISPS GATHER LUMBER. LUMBER PAYS', 'FOR SENDS AND KING UPGRADES.'],
  3: ['SENDS: BUY UNITS THAT ATTACK', 'THE FOE LANE NEXT WAVE. EACH ONE', 'RAISES YOUR INCOME.'],
  6: ['TABS: WATCH OTHER LANES AND THE', 'KINGS. SWIPE THE FIELD TO PAN.'],
  7: ['TAP ONE OF YOUR FIGHTERS TO', 'UPGRADE OR SELL IT. THE ? BUTTON', 'SHOWS THE DAMAGE TYPE CHART.'],
};

const TIPS: Tip[] = [
  { lines: ['BUILD FIGHTERS: PICK ONE ON THE', 'COMMAND CARD (OR Q-V), THEN CLICK', 'A FREE SPOT ON THE GRID.'], spot: { x: 2, y: 186, w: 178, h: 84 }, when: building },
  { lines: ['GOLD BUYS FIGHTERS. AFTER EACH', 'WAVE YOU GET YOUR INCOME.'], spot: { x: 340, y: 186, w: 138, h: 24 }, when: building },
  { lines: ['WISPS (B) GATHER LUMBER. LUMBER', 'PAYS FOR SENDS AND KING UPGRADES.'], spot: { x: 341, y: 212, w: 136, h: 56 }, when: building },
  { lines: ['SENDS (2): BUY UNITS THAT ATTACK', 'THE FOE LANE NEXT WAVE. EACH ONE', 'RAISES YOUR INCOME.'], spot: { x: 161, y: 187, w: 18, h: 30 }, when: building },
  { lines: ['CREEPS PASSING THE RED LINE LEAK', 'TO YOUR KING. IF IT FALLS, YOUR', 'TEAM LOSES.'], spot: { x: 2, y: FIELD_TOP, w: 476, h: FIELD_H }, when: fighting },
  { lines: ['TOP RIGHT: KING HP OF BOTH TEAMS', 'AND HOW MANY ENEMIES ARE LEFT.'], spot: { x: 250, y: 2, w: 228, h: 22 }, when: fighting },
  { lines: ['TABS: WATCH OTHER LANES AND THE', 'KINGS. TAB STEPS, SPACE: HOME.'], spot: { x: 82, y: 1, w: 166, h: 23 }, when: fighting },
  { lines: ['CLICK ONE OF YOUR FIGHTERS TO', 'UPGRADE (U) OR SELL IT (DEL).', 'T SHOWS THE DAMAGE TYPE CHART.'], spot: { x: 182, y: 186, w: 156, h: 84 }, when: (g) => building(g) && g.wave >= 2 },
];

/**
 * First-game tips: one FF6 window at a time, each pointing at the HUD part it explains,
 * shown once its game state comes up. A checkbox turns them off for good.
 */
export class Tutorial {
  private next = 0;
  private open: Phaser.GameObjects.Container | null = null;
  private outline: Phaser.GameObjects.Container | null = null;
  private optOut = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameView,
  ) {
    if (!tipsEnabled()) this.next = TIPS.length;
  }

  update(): void {
    if (this.open || this.next >= TIPS.length) return;
    const tip = TIPS[this.next]!;
    if (tip.when(this.game)) this.show(tip);
  }

  private show(tip: Tip): void {
    const s = this.scene;
    const lines = (TOUCH && TOUCH_LINES[this.next]) || tip.lines;
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
    const okZone = zone(w - 34, 28, () => this.dismiss());
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

  private dismiss(): void {
    this.open?.destroy();
    this.outline?.destroy();
    this.open = null;
    this.outline = null;
    this.next++;
    if (this.optOut) {
      setTipsEnabled(false);
      this.next = TIPS.length;
    }
  }
}
