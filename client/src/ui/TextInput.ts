import Phaser from 'phaser';
import { VIEW_W } from '../layout.ts';
import { FONT } from '../scenes/BootScene.ts';
import { panelTexture } from './ff6Window.ts';
import { dedupe } from './keys.ts';
import { TOUCH } from './touch.ts';

export interface TextInputOptions {
  maxLength: number;
  /** Characters accepted while typing or pasting. */
  allowed: RegExp;
  initial?: string;
  upperCase?: boolean;
  onEnter?: (value: string) => void;
  /** Turns pasted or IME text into what gets typed; by default an invite link becomes its room code. */
  clean?: (raw: string) => string;
}

/**
 * In-canvas text field: type, Backspace, Enter, and Ctrl+V paste while it is shown. On touch
 * devices an invisible DOM input lies over it, so tapping brings up the on-screen keyboard.
 */
export class TextInput {
  value: string;
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly cursor: Phaser.GameObjects.Rectangle;
  private active = false;
  private readonly onKey = dedupe((e: KeyboardEvent) => this.key(e));
  private readonly onPaste = (e: ClipboardEvent) => this.paste(e);
  private readonly dom: HTMLInputElement | null = null;
  private readonly place = () => this.placeDom();
  /** Characters that fit the field; longer values scroll to show their end. */
  private readonly fits: number;
  private readonly clean: (raw: string) => string;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number, w: number, private readonly o: TextInputOptions) {
    this.value = o.initial ?? '';
    this.fits = Math.floor((w - 10) / 8);
    this.clean = o.clean ?? roomCode;
    this.bg = scene.add.image(x, y, panelTexture(scene, w, 16, 'slotActive')).setOrigin(0, 0);
    this.text = scene.add.bitmapText(x + 5, y + 5, FONT, '');
    this.cursor = scene.add.rectangle(0, y + 4, 6, 9, 0xfff080).setOrigin(0, 0);
    scene.tweens.add({ targets: this.cursor, alpha: 0, duration: 400, yoyo: true, repeat: -1 });
    scene.input.keyboard!.on('keydown', this.onKey);
    window.addEventListener('paste', this.onPaste);
    if (TOUCH) {
      this.dom = this.createDom();
      window.addEventListener('resize', this.place);
    }
    scene.events.once('shutdown', () => this.destroy());
    this.setActive(false);
    this.render();
  }

  setActive(active: boolean): this {
    this.active = active;
    this.bg.setVisible(active);
    this.text.setVisible(active);
    this.cursor.setVisible(active);
    if (this.dom) {
      this.dom.style.display = active ? 'block' : 'none';
      this.placeDom();
      // Browsers only open the keyboard from a gesture; otherwise the tap on the field does it.
      if (active) this.dom.focus();
    }
    return this;
  }

  get isActive(): boolean {
    return this.active;
  }

  clear(): this {
    this.value = '';
    if (this.dom) this.dom.value = '';
    this.render();
    return this;
  }

  setDepth(depth: number): this {
    this.bg.setDepth(depth);
    this.text.setDepth(depth + 1);
    this.cursor.setDepth(depth + 1);
    return this;
  }

  destroy(): void {
    this.dom?.remove();
    window.removeEventListener('resize', this.place);
    window.removeEventListener('paste', this.onPaste);
    this.scene.input.keyboard?.off('keydown', this.onKey);
    this.bg.destroy();
    this.text.destroy();
    this.cursor.destroy();
  }

  private key(e: KeyboardEvent): void {
    if (!this.active || this.dom) return;
    if (e.key === 'Backspace') this.value = this.value.slice(0, -1);
    else if (e.key === 'Enter') this.o.onEnter?.(this.value);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) this.append(e.key);
    this.render();
  }

  private paste(e: ClipboardEvent): void {
    if (!this.active || this.dom) return;
    this.append(this.clean(e.clipboardData?.getData('text') ?? ''));
    this.render();
  }

  private createDom(): HTMLInputElement {
    const el = document.createElement('input');
    Object.assign(el, { type: 'text', autocomplete: 'off', spellcheck: false, enterKeyHint: 'go', value: this.value });
    el.autocapitalize = this.o.upperCase ? 'characters' : 'off';
    // 16px keeps iOS from zooming into the field; the text itself stays the canvas one.
    Object.assign(el.style, { position: 'fixed', display: 'none', margin: '0', padding: '0', border: '0', outline: 'none', fontSize: '16px', background: 'transparent', color: 'transparent', caretColor: 'transparent' });
    el.addEventListener('input', () => {
      this.value = '';
      this.append(this.clean(el.value));
      el.value = this.value;
      this.render();
    });
    el.addEventListener('keydown', (e) => {
      // Kept away from Phaser's window listener, which would type every key a second time.
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      el.blur();
      this.o.onEnter?.(this.value);
    });
    document.body.appendChild(el);
    return el;
  }

  /** Lay the DOM input over the canvas field (layout px -> page px). */
  private placeDom(): void {
    if (!this.dom) return;
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const k = rect.width / VIEW_W;
    Object.assign(this.dom.style, {
      left: `${rect.left + this.bg.x * k}px`,
      top: `${rect.top + this.bg.y * k}px`,
      width: `${this.bg.width * k}px`,
      height: `${16 * k}px`,
    });
  }

  private append(chars: string): void {
    for (const ch of chars) {
      const c = this.o.upperCase ? ch.toUpperCase() : ch;
      if (this.o.allowed.test(c) && this.value.length < this.o.maxLength) this.value += c;
    }
  }

  private render(): void {
    const shown = this.value.slice(-this.fits);
    this.text.setText(shown);
    this.cursor.setX(this.text.x + shown.length * 8);
  }
}

/** A pasted invite link works too: take the room code after "room=". */
function roomCode(raw: string): string {
  return /room=([^&\s]+)/.exec(raw)?.[1] ?? raw.trim();
}
