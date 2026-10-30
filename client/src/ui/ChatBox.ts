import Phaser from 'phaser';
import { CHAT_MAX, type ChatScope, type TeamId } from '@legion/shared';
import type { ChatEntry, ChatLog } from '../net/ChatLog.ts';
import { FONT } from '../scenes/BootScene.ts';
import { dedupe } from './keys.ts';
import { ME_COLOR, teamColor } from './playerColors.ts';
import { TextInput } from './TextInput.ts';

export interface ChatBoxOptions {
  x: number;
  /** Bottom edge of the box; the input row sits there, the log above it. */
  bottom: number;
  /** Log width in characters. */
  cols: number;
  rows: number;
  /** In the game lines fade after a while and team chat exists; the lobby keeps everything, all chat only. */
  inGame: boolean;
  /** The local player's team (for the TEAM tag colour). */
  team: () => TeamId;
  depth?: number;
  /** While true, Enter doesn't open the chat (another text field has the keyboard). */
  blocked?: () => boolean;
}

/** Lines stay this long in the game before they fade out (the full log shows while typing). */
const SHOW_MS = 10_000;
const FADE_MS = 1000;
const ROW_H = 10;
/** A key that closed the chat within this window must not reach the game (Esc, Enter). */
const SWALLOW_MS = 100;

interface Row {
  head: string;
  headColor: number;
  body: string;
  at: number;
}

/**
 * Chat log plus input row. Enter opens team chat (Shift+Enter or the lobby: all chat), Enter
 * sends, Esc cancels, TAB or a click on the tag switches between TEAM and ALL.
 */
export class ChatBox {
  private readonly input: TextInput;
  private readonly tag: Phaser.GameObjects.BitmapText;
  private readonly heads: Phaser.GameObjects.BitmapText[] = [];
  private readonly bodies: Phaser.GameObjects.BitmapText[] = [];
  private readonly shade: Phaser.GameObjects.Image;
  private scope: ChatScope = 'team';
  private open = false;
  private closedAt = -Infinity;
  private shownVersion = -1;
  private rowsCache: Row[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly log: ChatLog,
    private readonly o: ChatBoxOptions,
  ) {
    const depth = o.depth ?? 0;
    const inputY = o.bottom - 16;
    const tagW = 7 * 8;
    this.shade = scene.add.image(o.x - 2, 0, '__WHITE').setOrigin(0, 0).setTint(0x000000).setAlpha(0.45).setDepth(depth).setVisible(false);
    for (let i = 0; i < o.rows; i++) {
      this.heads.push(scene.add.bitmapText(o.x, 0, FONT, '').setDepth(depth + 1));
      this.bodies.push(scene.add.bitmapText(o.x, 0, FONT, '').setDepth(depth + 1));
    }
    this.tag = scene.add
      .bitmapText(o.x, inputY + 5, FONT, '')
      .setDepth(depth + 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.toggleScope();
      });
    // Wide enough for a full line; the field itself scrolls if the box is narrower.
    const inputW = Math.min(CHAT_MAX * 8 + 10, o.cols * 8 - tagW);
    this.input = new TextInput(scene, o.x + tagW, inputY, inputW, {
      maxLength: CHAT_MAX,
      allowed: /[\x20-\x7e]/,
      clean: (raw) => raw,
      onEnter: (value) => this.submit(value),
    }).setDepth(depth);
    scene.input.keyboard!.on('keydown', dedupe((e: KeyboardEvent) => this.key(e)));
    this.close();
  }

  /** True while typing (and right after closing), so scenes ignore their hotkeys. */
  get isOpen(): boolean {
    return this.open;
  }

  get capturing(): boolean {
    return this.open || performance.now() - this.closedAt < SWALLOW_MS;
  }

  /** Opens the input; on touch this must run from a tap so the on-screen keyboard comes up. */
  openInput(scope: ChatScope = 'team'): void {
    this.scope = this.o.inGame ? scope : 'all';
    this.open = true;
    this.input.clear().setActive(true);
    this.renderTag();
    this.tag.setVisible(true);
    this.shownVersion = -1;
  }

  close(): void {
    if (this.open) this.closedAt = performance.now();
    this.open = false;
    this.input.setActive(false);
    this.tag.setVisible(false);
    this.shownVersion = -1;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.openInput();
  }

  update(): void {
    if (this.shownVersion !== this.log.version) {
      this.rowsCache = this.layout(this.log.lines);
      this.shownVersion = this.log.version;
    }
    const now = performance.now();
    const rows = this.rowsCache.slice(-this.o.rows);
    const top = this.o.bottom - 18 - rows.length * ROW_H;
    let visible = 0;
    let firstY = Infinity;
    let width = 0;
    this.heads.forEach((head, i) => {
      const row = rows[i];
      const body = this.bodies[i]!;
      const age = now - (row?.at ?? 0);
      const alpha = !row ? 0 : this.open || !this.o.inGame ? 1 : Phaser.Math.Clamp((SHOW_MS + FADE_MS - age) / FADE_MS, 0, 1);
      head.setVisible(alpha > 0);
      body.setVisible(alpha > 0);
      if (!row || alpha <= 0) return;
      const y = top + i * ROW_H;
      if (head.text !== row.head) head.setText(row.head);
      if (body.text !== row.body) body.setText(row.body);
      head.setPosition(this.o.x, y).setTint(row.headColor).setAlpha(alpha);
      body.setPosition(this.o.x + row.head.length * 8, y).setAlpha(alpha);
      visible++;
      firstY = Math.min(firstY, y);
      width = Math.max(width, (row.head.length + row.body.length) * 8);
    });
    // A dark backing only in the game, where the lines sit over the battlefield.
    const shaded = this.o.inGame && visible > 0;
    this.shade.setVisible(shaded);
    if (shaded) this.shade.setPosition(this.o.x - 2, firstY - 2).setDisplaySize(width + 4, this.o.bottom - 18 - firstY + 2);
  }

  private key(e: KeyboardEvent): void {
    if (!this.open) {
      if (e.key === 'Enter' && performance.now() - this.closedAt >= SWALLOW_MS && !this.o.blocked?.()) this.openInput(e.shiftKey ? 'all' : 'team');
      return;
    }
    if (e.key === 'Escape') this.close();
    else if (e.key === 'Tab') {
      e.preventDefault();
      this.toggleScope();
    }
  }

  private submit(value: string): void {
    this.log.send(this.scope, value);
    this.close();
  }

  private toggleScope(): void {
    if (!this.o.inGame) return;
    this.scope = this.scope === 'team' ? 'all' : 'team';
    this.renderTag();
  }

  private renderTag(): void {
    this.tag.setText(this.scope === 'team' ? '[TEAM]' : '[ALL]').setTint(this.scope === 'team' ? teamColor(this.o.team()) : 0xffffff);
  }

  /** Chat lines as display rows: a coloured "[TEAM] NAME: " head, then the text word-wrapped. */
  private layout(lines: readonly ChatEntry[]): Row[] {
    const rows: Row[] = [];
    for (const line of lines.slice(-this.o.rows)) {
      const tag = this.o.inGame ? (line.scope === 'team' ? '[TEAM] ' : '[ALL] ') : '';
      const head = `${tag}${line.name}: `;
      const headColor = line.mine ? ME_COLOR : teamColor(line.team);
      wrap(line.text, this.o.cols - head.length, this.o.cols - 2).forEach((body, i) =>
        rows.push(i === 0 ? { head, headColor, body, at: line.at } : { head: '  ', headColor, body, at: line.at }),
      );
    }
    return rows;
  }
}

/** Word wrap: the first row holds `first` characters, the rest `rest`; overlong words are cut. */
function wrap(text: string, first: number, rest: number): string[] {
  const out: string[] = [];
  let left = text;
  let width = Math.max(8, first);
  while (left.length > width) {
    const cut = left.lastIndexOf(' ', width);
    const at = cut > 0 ? cut : width;
    out.push(left.slice(0, at));
    left = left.slice(at).trimStart();
    width = Math.max(8, rest);
  }
  out.push(left);
  return out;
}
