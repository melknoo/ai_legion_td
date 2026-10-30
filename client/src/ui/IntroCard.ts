import Phaser from 'phaser';
import type { GameView } from '@legion/shared';
import { builderPortrait } from '../assets/manifest.ts';
import { FIELD_TOP, VIEW_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { facesetKey } from './Hud.ts';
import { ME_COLOR, TEAM_NAMES, teamColor } from './playerColors.ts';
import { TextButton } from './TextButton.ts';
import { TOUCH } from './touch.ts';

const W = 400;
const H = 152;
/** Name lists of allies and foes are cut to fit one line each. */
const LIST_MAX = 34;

/**
 * Window at the start of every game: who you are, which team, what to do. It doesn't pause the
 * build timer; OK, Space or Esc close it, and it goes away by itself when the first wave starts.
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
    const foeTeam = me.team === 0 ? 1 : 0;
    const names = (team: number) =>
      game.players
        .filter((p) => p.team === team && p.index !== me.index)
        .map((p) => p.name.toUpperCase())
        .join(', ');
    const fit = (s: string) => (s.length > LIST_MAX ? `${s.slice(0, LIST_MAX - 3)}...` : s);
    const x = Math.round((VIEW_W - W) / 2);
    const y = FIELD_TOP + 4;
    const depth = 19800;
    const text = (tx: number, ty: number, s: string, color = 0xffffff) => {
      const t = scene.add.bitmapText(x + tx, y + ty, FONT, s).setTint(color).setDepth(depth).setLineSpacing(3);
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

    // Who you are: name in gold (solo seats are just "You"), builder with portrait, team.
    const solo = me.name.toLowerCase() === 'you';
    text(10, 8, solo ? 'WELCOME, COMMANDER!' : `YOU ARE ${me.name.toUpperCase()}`, ME_COLOR);
    const builderLine = builder?.random ? 'PROPHET: A RANDOM ROSTER OF FIGHTERS' : `YOUR BUILDER: ${(builder?.name ?? '?').toUpperCase()}`;
    text(10, 20, builderLine);
    text(10, 32, `YOUR TEAM: ${TEAM_NAMES[me.team]}`, teamColor(me.team));
    const allies = names(me.team);
    if (allies) text(10, 43, fit(`WITH ${allies}`), teamColor(me.team));
    text(10, allies ? 54 : 43, fit(`AGAINST TEAM ${TEAM_NAMES[foeTeam]}: ${names(foeTeam)}`), teamColor(foeTeam));
    if (builder && !builder.random) {
      this.parts.push(scene.add.image(x + W - 12, y + 8, facesetKey(builderPortrait(builder))).setOrigin(1, 0).setDepth(depth));
    }

    // What to do.
    const build = TOUCH ? 'TAP A FIGHTER BELOW, THEN YOUR GRID' : 'PICK A FIGHTER (Q-V), CLICK YOUR GRID';
    text(
      10,
      70,
      [
        'CREEPS COME FROM THE LEFT. STOP THEM BEFORE THE',
        `RED LINE: ${build}.`,
        'EVERY CREEP THAT PASSES HURTS YOUR KING.',
        'KILL THE FOE KING TO WIN. THE WAVE STARTS BY',
        'ITSELF WHEN THE BUILD TIMER (TOP LEFT) RUNS OUT.',
      ].join('\n'),
      0xe0e8ff,
    );
    this.parts.push(
      new TextButton(scene, x + W - 196, y + H - 22, 104, 'HOW TO PLAY', () => {
        this.close();
        onHelp();
      }).setDepth(depth),
      new TextButton(scene, x + W - 84, y + H - 22, 72, "LET'S GO", () => this.close()).setDepth(depth),
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
