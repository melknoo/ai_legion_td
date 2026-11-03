import Phaser from 'phaser';
import type { GameView } from '@legion/shared';
import { builderPortrait } from '../assets/manifest.ts';
import { FIELD_H, FIELD_TOP, VIEW_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { facesetKey } from './Hud.ts';
import { ME_COLOR, TEAM_NAMES, teamColor } from './playerColors.ts';
import { TextButton } from './TextButton.ts';

const W = 288;
const H = 68;

/**
 * Window at the start of every game: your builder and team, and the goal in two lines (the rest
 * is in How to Play and the tips). It doesn't pause the build timer; OK, Space or Esc close it,
 * and it goes away by itself when the first wave starts.
 */
export class IntroCard {
  private readonly parts: { destroy(): void }[] = [];
  private closed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameView,
    player: number,
    onHelp: () => void,
  ) {
    const me = game.players[player]!;
    const builder = game.data.builders[me.builder];
    const x = Math.round((VIEW_W - W) / 2);
    const y = FIELD_TOP + Math.round((FIELD_H - H) / 2);
    const depth = 19800;
    const text = (tx: number, ty: number, s: string, color = 0xffffff) => {
      const t = scene.add.bitmapText(x + tx, y + ty, FONT, s).setTint(color).setDepth(depth);
      this.parts.push(t);
      return t;
    };
    // Clicks on the card must not place fighters on the grid underneath.
    const blocker = scene.add
      .zone(x, y, W, H)
      .setOrigin(0, 0)
      .setInteractive()
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation())
      .setDepth(depth);
    this.parts.push(blocker, ff6Window(scene, x, y, W, H).setDepth(depth));

    // Portrait, then who you are (builder in gold, team in its colour) and what to do.
    if (builder && !builder.random) {
      this.parts.push(scene.add.image(x + 8, y + 8, facesetKey(builderPortrait(builder))).setOrigin(0, 0).setDepth(depth));
    }
    const you = `YOU: ${(builder?.name ?? '?').toUpperCase()}, `;
    text(54, 9, you, ME_COLOR);
    text(54 + you.length * 8, 9, `TEAM ${TEAM_NAMES[me.team]}`, teamColor(me.team));
    text(54, 21, 'BUILD FIGHTERS ON YOUR GRID,\nKILL THE FOE KING TO WIN.', 0xe0e8ff).setLineSpacing(3);
    this.parts.push(
      new TextButton(scene, x + W - 196, y + H - 21, 104, 'HOW TO PLAY', () => {
        this.close();
        onHelp();
      }).setDepth(depth),
      new TextButton(scene, x + W - 84, y + H - 21, 72, "LET'S GO", () => this.close()).setDepth(depth),
    );
    const kb = scene.input.keyboard;
    const onKey = (e: KeyboardEvent) => (e.key === ' ' || e.key === 'Escape') && this.close();
    kb?.on('keydown', onKey);
    this.parts.push({ destroy: () => kb?.off('keydown', onKey) });
  }

  get open(): boolean {
    return !this.closed;
  }

  update(): void {
    if (!this.closed && this.game.phase !== 'build') this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.parts.forEach((p) => p.destroy());
  }
}
