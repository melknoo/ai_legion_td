import Phaser from 'phaser';
import type { GameView } from '@legion/shared';
import type { ChatLog } from '../net/ChatLog.ts';
import { ChatBox } from '../ui/ChatBox.ts';
import { FIELD_H, FIELD_TOP, VIEW_W, layoutCamera } from '../layout.ts';
import { ff6Window } from '../ui/ff6Window.ts';
import { Hud, type HudActions, type HudState, type HudView } from '../ui/Hud.ts';
import { MiniButton } from '../ui/SlotButton.ts';
import { TextButton } from '../ui/TextButton.ts';
import { howToPlay } from '../ui/howToPlay.ts';
import { IntroCard } from '../ui/IntroCard.ts';
import { optionsWindow } from '../ui/options.ts';
import { TOUCH } from '../ui/touch.ts';
import { Tutorial } from '../ui/Tutorial.ts';
import { typeChart } from '../ui/typeChart.ts';
import { FONT } from './BootScene.ts';

/** What the battlefield scene hands to the HUD. */
export interface UiLink {
  game: GameView;
  player: number;
  views: HudView[];
  actions: HudActions;
  state(): HudState;
  /** Online games only. */
  chat?: ChatLog;
}

/**
 * Screen-space overlay above the zoomed battlefield: HUD panels, field label,
 * message windows and feedback text. Runs in parallel with BattleScene.
 */
export class UiScene extends Phaser.Scene {
  private hud!: Hud;
  private tutorial!: Tutorial;
  private link!: UiLink;
  private fieldLabel!: Phaser.GameObjects.BitmapText;
  private message: Phaser.GameObjects.Container | null = null;
  private summary: Phaser.GameObjects.Container | null = null;
  private chart: Phaser.GameObjects.Container | null = null;
  private closeOptions: (() => void) | null = null;
  private closeHelp: (() => void) | null = null;
  private choices: TextButton[] = [];
  private chatBox: ChatBox | null = null;
  private intro!: IntroCard;

  constructor() {
    super('ui');
  }

  create(link: UiLink): void {
    layoutCamera(this);
    this.link = link;
    this.chart = null;
    this.closeOptions = null;
    this.closeHelp = null;
    this.hud = new Hud(this, link.game, link.player, link.views, link.actions);
    this.tutorial = new Tutorial(this, link.game, link.player);
    this.fieldLabel = this.add.bitmapText(6, FIELD_TOP + 3, FONT, '');
    // Options in the top right corner of the battlefield (O).
    const size = TOUCH ? 16 : 13;
    new MiniButton(this, { x: VIEW_W - size - 3, y: FIELD_TOP + 3, size, touchPad: 2, text: 'O', onClick: () => this.toggleOptions(), onHover: () => {} });
    // Chat over the bottom left of the field (Enter: team, Shift+Enter: all), with a button for touch.
    this.chatBox = link.chat
      ? new ChatBox(this, link.chat, { x: 6, bottom: FIELD_TOP + FIELD_H - 1, cols: 56, rows: 6, inGame: true, team: () => link.game.players[link.player]!.team, depth: 19400 })
      : null;
    if (this.chatBox) {
      const box = this.chatBox;
      new MiniButton(this, { x: VIEW_W - 2 * (size + 3), y: FIELD_TOP + 3, size, touchPad: 2, text: 'C', onClick: () => box.toggle(), onHover: () => {} });
    }
    // Who you are and what to do; the tips start once it is closed.
    this.intro = new IntroCard(this, link.game, link.player, () => this.openHelp());
  }

  override update(): void {
    this.hud.update(this.link.state());
    this.intro.update();
    if (!this.intro.open && !this.closeHelp) this.tutorial.update();
    this.chatBox?.update();
  }

  /** While typing a chat line or reading How to Play the battlefield ignores its hotkeys. */
  get keysCaptured(): boolean {
    return !!this.closeHelp || (this.chatBox?.capturing ?? false);
  }

  /** Rules overview over the battlefield (from the options window or the intro card). */
  openHelp(): void {
    if (this.closeHelp) return;
    if (this.closeOptions) this.toggleOptions();
    const close = howToPlay(this, () => {
      close();
      // A frame later, so the closing Esc doesn't also reach the battlefield.
      this.time.delayedCall(0, () => (this.closeHelp = null));
    });
    this.closeHelp = close;
  }

  setFieldLabel(text: string, color: number): void {
    this.fieldLabel?.setText(text).setTint(color);
  }

  /** FF6 message window over the battlefield; `holdMs` = 0 keeps it open. Returns its bottom edge. */
  showBanner(lines: string[], holdMs = 1300): number {
    this.message?.destroy();
    this.choices.forEach((b) => b.destroy());
    this.choices = [];
    const w = Math.max(...lines.map((l) => l.length)) * 8 + 32;
    const h = lines.length * 11 + 13;
    const box = ff6Window(this, -w / 2, -h / 2, w, h);
    const label = this.add.bitmapText(0, 1, FONT, lines.join('\n')).setOrigin(0.5).setCenterAlign().setLineSpacing(3);
    const c = this.add.container(VIEW_W / 2, FIELD_TOP + 60, [box, label]).setDepth(20000).setScale(1, 0);
    this.message = c;
    this.tweens.add({ targets: c, scaleY: 1, duration: 120, ease: 'Back.easeOut' });
    if (holdMs) this.tweens.add({ targets: c, alpha: 0, delay: holdMs, duration: 300, onComplete: () => c.destroy() });
    return c.y + h / 2;
  }

  /** A row of buttons under the open message window (end screen), so it works without keys. */
  showChoices(y: number, choices: { label: string; action: () => void }[]): void {
    const w = 88;
    const left = (VIEW_W - choices.length * (w + 8) + 8) / 2;
    this.choices = choices.map((c, i) => new TextButton(this, left + i * (w + 8), y, w, c.label, c.action, 18).setDepth(20000));
  }

  /** Wave result in a small window left of the build grid (under the field label), so the grid stays free. */
  showSummary(lines: { text: string; color?: number }[], holdMs = 4000): void {
    this.hideSummary();
    const w = Math.max(...lines.map((l) => l.text.length)) * 8 + 14;
    const h = lines.length * 10 + 9;
    const box = ff6Window(this, 0, 0, w, h);
    const texts = lines.map((l, i) => this.add.bitmapText(7, 5 + i * 10, FONT, l.text).setTint(l.color ?? 0xffffff));
    const c = this.add.container(4, FIELD_TOP + 14, [box, ...texts]).setDepth(19500).setAlpha(0);
    this.summary = c;
    this.tweens.add({ targets: c, alpha: 1, duration: 150 });
    this.tweens.add({ targets: c, alpha: 0, delay: holdMs, duration: 400, onComplete: () => this.hideSummary() });
  }

  hideSummary(): void {
    if (this.summary) {
      this.tweens.killTweensOf(this.summary);
      this.summary.destroy();
    }
    this.summary = null;
  }

  toggleWavePreview(): void {
    this.hud.toggleWave();
  }

  unpinWavePreview(): void {
    this.hud.unpinWave();
  }

  /** Short feedback line rising over the battlefield. */
  get typeChartOpen(): boolean {
    return this.chart !== null;
  }

  /** Attack-vs-armor table over the battlefield (T or the "?" button). */
  toggleTypeChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
      return;
    }
    this.chart = typeChart(this, this.link.game, this.link.player, VIEW_W / 2, FIELD_TOP + FIELD_H / 2);
  }

  get optionsOpen(): boolean {
    return this.closeOptions !== null;
  }

  /** Sound, shake and tips settings over the battlefield (O or the button in the field corner). */
  toggleOptions(): void {
    if (this.closeOptions) {
      this.closeOptions();
      this.closeOptions = null;
      return;
    }
    this.closeOptions = optionsWindow(this, VIEW_W / 2, FIELD_TOP + FIELD_H / 2, () => this.toggleOptions(), () => this.openHelp());
  }

  floatText(text: string, color: number, x = VIEW_W / 2, y = FIELD_TOP + 40): void {
    const t = this.add.bitmapText(x, y, FONT, text).setOrigin(0.5).setTint(color).setDepth(10002);
    this.tweens.add({ targets: t, y: y - 12, alpha: 0, duration: 900, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }
}
