import Phaser from 'phaser';
import type { GameView } from '@legion/shared';
import type { ChatLog } from '../net/ChatLog.ts';
import { ChatBox } from '../ui/ChatBox.ts';
import { FIELD_H, FIELD_TOP, SHOWCASE, VIEW_H, VIEW_W, layoutCamera } from '../layout.ts';
import { ff6Window } from '../ui/ff6Window.ts';
import { Hud, type HudActions, type HudState } from '../ui/Hud.ts';
import { Minimap, type MinimapLink } from '../ui/Minimap.ts';
import { MiniButton } from '../ui/SlotButton.ts';
import { TextButton } from '../ui/TextButton.ts';
import { howToPlay } from '../ui/howToPlay.ts';
import { IntroCard } from '../ui/IntroCard.ts';
import { optionsWindow } from '../ui/options.ts';
import { TOUCH } from '../ui/touch.ts';
import { Tutorial } from '../ui/Tutorial.ts';
import { typeChart } from '../ui/typeChart.ts';
import { FONT } from './BootScene.ts';

/** Right edge of the options and chat buttons in the top bar (the "MY/FOE" king labels start at 252). */
const TOP_BUTTONS_RIGHT = 246;

/** What the battlefield scene hands to the HUD. */
export interface UiLink {
  game: GameView;
  player: number;
  minimap: MinimapLink;
  actions: HudActions;
  state(): HudState;
  /** Online games only. */
  chat?: ChatLog;
  /** Solo games only: the pause button in the top bar. */
  pause?: () => void;
  /** Campaign elites: two lines for the intro card in place of the goal. */
  notice?: [string, string];
}

/**
 * Screen-space overlay above the zoomed battlefield: HUD panels, field label,
 * message windows and feedback text. Runs in parallel with BattleScene.
 */
export class UiScene extends Phaser.Scene {
  private hud!: Hud;
  private minimap!: Minimap;
  private tutorial!: Tutorial;
  private link!: UiLink;
  private message: Phaser.GameObjects.Container | null = null;
  private summary: Phaser.GameObjects.Container | null = null;
  private chart: Phaser.GameObjects.Container | null = null;
  private closeOptions: (() => void) | null = null;
  private closeHelp: (() => void) | null = null;
  private choices: TextButton[] = [];
  private chatBox: ChatBox | null = null;
  private intro!: IntroCard;
  private pauseMenu: { destroy(): void }[] | null = null;

  constructor() {
    super('ui');
  }

  create(link: UiLink): void {
    layoutCamera(this);
    // Showcase clips run without a HUD (the scene keeps running for BattleScene's calls).
    if (SHOWCASE) this.scene.setVisible(false);
    this.link = link;
    this.chart = null;
    this.closeOptions = null;
    this.closeHelp = null;
    this.pauseMenu = null;
    this.hud = new Hud(this, link.game, link.player, link.actions);
    this.minimap = new Minimap(this, link.game, link.player, link.minimap);
    this.tutorial = new Tutorial(this, link.game, link.player);
    // Options (O) and chat in the top bar, left of the king bars; the field's right margin holds the minimap.
    const size = TOUCH ? 16 : 13;
    const y = 1 + Math.floor((23 - size) / 2);
    new MiniButton(this, { x: TOP_BUTTONS_RIGHT - size, y, size, touchPad: 2, text: 'O', onClick: () => this.toggleOptions(), onHover: () => {} });
    // Chat over the bottom left of the field (Enter: team, Shift+Enter: all), with a button for touch.
    this.chatBox = link.chat
      ? new ChatBox(this, link.chat, { x: 6, bottom: FIELD_TOP + FIELD_H - 1, cols: 56, rows: 6, inGame: true, team: () => link.game.players[link.player]!.team, depth: 19400 })
      : null;
    if (this.chatBox) {
      const box = this.chatBox;
      new MiniButton(this, { x: TOP_BUTTONS_RIGHT - 2 * size - 3, y, size, touchPad: 2, text: 'C', onClick: () => box.toggle(), onHover: () => {} });
    }
    // Solo games pause (P or Esc); online games have the chat button in that spot.
    if (link.pause) {
      const pause = link.pause;
      new MiniButton(this, { x: TOP_BUTTONS_RIGHT - 2 * size - 3, y, size, touchPad: 2, text: 'P', onClick: () => pause(), onHover: () => {} });
    }
    // Who you are and what to do; the tips start once it is closed.
    this.intro = new IntroCard(this, link.game, link.player, () => this.openHelp(), link.notice);
  }

  override update(): void {
    this.hud.update(this.link.state());
    this.minimap.update();
    this.intro.update();
    if (!this.intro.open && !this.closeHelp) this.tutorial.update();
    this.chatBox?.update();
  }

  /** Space and Esc close the intro card; the battlefield leaves them alone meanwhile. */
  get introOpen(): boolean {
    return this.intro?.open ?? false;
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

  get pauseOpen(): boolean {
    return this.pauseMenu !== null;
  }

  /** Pause window over the dimmed battlefield; it swallows clicks to the field and HUD below it. */
  showPause(items: { label: string; action: () => void }[]): void {
    this.hidePause();
    const w = 168;
    const h = 34 + items.length * 21;
    const x = Math.round((VIEW_W - w) / 2);
    const y = FIELD_TOP + Math.round((FIELD_H - h) / 2);
    // Under the options (21000) and How to Play (21500) windows the menu opens.
    const depth = 20500;
    const blocker = this.add
      .zone(0, 0, VIEW_W, VIEW_H)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(depth)
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
    const dim = this.add.rectangle(0, FIELD_TOP, VIEW_W, FIELD_H, 0x000010, 0.45).setOrigin(0, 0).setDepth(depth);
    const box = ff6Window(this, x, y, w, h).setDepth(depth);
    const title = this.add.bitmapText(VIEW_W / 2, y + 9, FONT, 'PAUSED').setOrigin(0.5, 0).setTint(0xfff080).setDepth(depth);
    const buttons = items.map((it, i) => new TextButton(this, x + 14, y + 25 + i * 21, w - 28, it.label, it.action, 18).setDepth(depth));
    this.pauseMenu = [blocker, dim, box, title, ...buttons];
  }

  hidePause(): void {
    this.pauseMenu?.forEach((p) => p.destroy());
    this.pauseMenu = null;
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
