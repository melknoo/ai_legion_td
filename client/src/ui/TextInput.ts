import Phaser from 'phaser';
import { FONT } from '../scenes/BootScene.ts';
import { panelTexture } from './ff6Window.ts';
import { dedupe } from './keys.ts';

export interface TextInputOptions {
  maxLength: number;
  /** Characters accepted while typing or pasting. */
  allowed: RegExp;
  initial?: string;
  upperCase?: boolean;
  onEnter?: (value: string) => void;
}

/** In-canvas text field: type, Backspace, Enter, and Ctrl+V paste while it is shown. */
export class TextInput {
  value: string;
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly cursor: Phaser.GameObjects.Rectangle;
  private active = false;
  private readonly onKey = dedupe((e: KeyboardEvent) => this.key(e));
  private readonly onPaste = (e: ClipboardEvent) => this.paste(e);

  constructor(private readonly scene: Phaser.Scene, x: number, y: number, w: number, private readonly o: TextInputOptions) {
    this.value = o.initial ?? '';
    this.bg = scene.add.image(x, y, panelTexture(scene, w, 16, 'slotActive')).setOrigin(0, 0);
    this.text = scene.add.bitmapText(x + 5, y + 5, FONT, '');
    this.cursor = scene.add.rectangle(0, y + 4, 6, 9, 0xfff080).setOrigin(0, 0);
    scene.tweens.add({ targets: this.cursor, alpha: 0, duration: 400, yoyo: true, repeat: -1 });
    scene.input.keyboard!.on('keydown', this.onKey);
    window.addEventListener('paste', this.onPaste);
    scene.events.once('shutdown', () => this.destroy());
    this.setActive(false);
    this.render();
  }

  setActive(active: boolean): this {
    this.active = active;
    this.bg.setVisible(active);
    this.text.setVisible(active);
    this.cursor.setVisible(active);
    return this;
  }

  destroy(): void {
    window.removeEventListener('paste', this.onPaste);
    this.scene.input.keyboard?.off('keydown', this.onKey);
    this.bg.destroy();
    this.text.destroy();
    this.cursor.destroy();
  }

  private key(e: KeyboardEvent): void {
    if (!this.active) return;
    if (e.key === 'Backspace') this.value = this.value.slice(0, -1);
    else if (e.key === 'Enter') this.o.onEnter?.(this.value);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) this.append(e.key);
    this.render();
  }

  private paste(e: ClipboardEvent): void {
    if (!this.active) return;
    // A pasted invite link works too: take the room code after "room=".
    const raw = e.clipboardData?.getData('text') ?? '';
    this.append(/room=([^&\s]+)/.exec(raw)?.[1] ?? raw.trim());
    this.render();
  }

  private append(chars: string): void {
    for (const ch of chars) {
      const c = this.o.upperCase ? ch.toUpperCase() : ch;
      if (this.o.allowed.test(c) && this.value.length < this.o.maxLength) this.value += c;
    }
  }

  private render(): void {
    this.text.setText(this.value);
    this.cursor.setX(this.text.x + this.value.length * 8);
  }
}
