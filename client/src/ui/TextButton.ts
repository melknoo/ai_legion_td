import Phaser from 'phaser';
import { FONT } from '../scenes/BootScene.ts';
import { panelTexture } from './ff6Window.ts';

/** Single-line FF6-style button. */
export class TextButton {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly textures: Record<'slot' | 'slotHover' | 'slotActive', string>;
  private hovered = false;
  private enabled = true;
  private active = false;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, label: string, onClick: () => void, h = 16) {
    this.textures = {
      slot: panelTexture(scene, w, h, 'slot'),
      slotHover: panelTexture(scene, w, h, 'slotHover'),
      slotActive: panelTexture(scene, w, h, 'slotActive'),
    };
    this.bg = scene.add.image(x, y, this.textures.slot).setOrigin(0, 0);
    this.text = scene.add.bitmapText(x + w / 2, y + h / 2 + 1, FONT, label).setOrigin(0.5);
    this.bg
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => ((this.hovered = true), this.refresh()))
      .on('pointerout', () => ((this.hovered = false), this.refresh()))
      .on('pointerdown', () => this.enabled && onClick());
  }

  setLabel(label: string): this {
    this.text.setText(label);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.text.setAlpha(enabled ? 1 : 0.4);
    return this;
  }

  setActive(active: boolean): this {
    this.active = active;
    this.refresh();
    return this;
  }

  setVisible(visible: boolean): this {
    this.bg.setVisible(visible);
    this.text.setVisible(visible);
    return this;
  }

  private refresh(): void {
    this.bg.setTexture(this.active ? this.textures.slotActive : this.hovered && this.enabled ? this.textures.slotHover : this.textures.slot);
  }
}
