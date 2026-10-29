import Phaser from 'phaser';
import { FONT } from '../scenes/BootScene.ts';
import { panelTexture } from './ff6Window.ts';

export interface SlotButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Icon area offset inside the button. */
  iconY?: number;
  /** Small tiles: show only this band of a tall icon (portraits), skipping `top` rows. */
  iconCrop?: { top: number; height: number };
  /** Lay the type badges out side by side (short tiles) instead of stacked. */
  badgeRow?: boolean;
  onClick: () => void;
  onHover: (over: boolean) => void;
}

/**
 * Clickable FF6-style tile: icon (portrait or skill icon), hotkey in the corner,
 * and a cost/label line with an optional small currency icon.
 */
export class SlotButton {
  readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly hue: Phaser.Filters.ColorMatrix;
  private readonly cornerBg: Phaser.GameObjects.Rectangle;
  private readonly corner: Phaser.GameObjects.BitmapText;
  private readonly labelBg: Phaser.GameObjects.Rectangle;
  private readonly costIcon: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.BitmapText;
  private readonly badgeBg: Phaser.GameObjects.Rectangle;
  private readonly badges: Phaser.GameObjects.Image[];
  /** Pulsing bright frame around the active tile. */
  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly textures: Record<'slot' | 'slotHover' | 'slotActive', string>;
  private hovered = false;
  private enabled = true;
  private active = false;
  private iconKey = '';
  private iconHue = 0;

  constructor(scene: Phaser.Scene, private readonly o: SlotButtonOptions) {
    this.textures = {
      slot: panelTexture(scene, o.w, o.h, 'slot'),
      slotHover: panelTexture(scene, o.w, o.h, 'slotHover'),
      slotActive: panelTexture(scene, o.w, o.h, 'slotActive'),
    };
    this.bg = scene.add.image(0, 0, this.textures.slot).setOrigin(0, 0);
    this.icon = scene.add.image(Math.floor(o.w / 2), o.iconY ?? 2, '__DEFAULT').setOrigin(0.5, 0);
    this.hue = this.icon.enableFilters().filters!.internal.addColorMatrix();
    // Hotkey letter, backed like the label so it reads on bright portraits.
    this.cornerBg = scene.add.rectangle(2, 2, 1, 9, 0x0c1240, 0.85).setOrigin(0, 0);
    this.corner = scene.add.bitmapText(3, 3, FONT, '').setTint(0xfff080);
    // Dark strip keeps the label readable where it overlaps a portrait.
    this.labelBg = scene.add.rectangle(0, o.h - 11, 1, 10, 0x0c1240, 0.85).setOrigin(0, 0);
    this.costIcon = scene.add.image(0, o.h - 10, '__DEFAULT').setOrigin(0, 0);
    this.label = scene.add.bitmapText(0, o.h - 10, FONT, '');
    // Small type icons stacked in the top-right corner.
    const row = o.badgeRow ? 1 : 0;
    this.badgeBg = scene.add.rectangle(o.w - 11 - row * 9, 2, 9, 9, 0x0c1240, 0.85).setOrigin(0, 0);
    this.badges = [0, 1].map((i) => scene.add.image(o.w - 10 - row * (1 - i) * 9, 3 + (1 - row) * i * 9, '__DEFAULT').setOrigin(0, 0));
    this.frame = scene.add.rectangle(1, 1, o.w - 2, o.h - 2).setOrigin(0, 0).setStrokeStyle(2, 0xfff4a0).setVisible(false);
    scene.tweens.add({ targets: this.frame, alpha: 0.35, duration: 350, yoyo: true, repeat: -1 });
    this.root = scene.add.container(o.x, o.y, [this.bg, this.icon, this.cornerBg, this.corner, this.labelBg, this.costIcon, this.label, this.badgeBg, ...this.badges, this.frame]);
    this.bg
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.hover(true))
      .on('pointerout', () => this.hover(false))
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (this.enabled) o.onClick();
      });
  }

  setContent(
    icon: string,
    label: string,
    opts: { hue?: number; corner?: string; costIcon?: string; labelColor?: number; badges?: { icon: string; tint: number }[]; badgeBg?: number } = {},
  ): this {
    const badges = opts.badges ?? [];
    this.badges.forEach((b, i) => {
      const spec = badges[i];
      b.setVisible(!!spec);
      if (spec) b.setTexture(spec.icon).setTint(spec.tint);
    });
    const along = badges.length * 9 + 1;
    this.badgeBg
      .setVisible(badges.length > 0)
      .setSize(this.o.badgeRow ? along : 9, this.o.badgeRow ? 9 : along)
      .setFillStyle(opts.badgeBg ?? 0x0c1240, 0.85);
    const hue = opts.hue ?? 0;
    if (icon !== this.iconKey || hue !== this.iconHue) {
      this.iconKey = icon;
      this.iconHue = hue;
      this.icon.setTexture(icon);
      const crop = this.o.iconCrop;
      if (crop && this.icon.height > crop.height) {
        this.icon.setCrop(0, crop.top, this.icon.width, crop.height).setY((this.o.iconY ?? 2) - crop.top);
      } else {
        this.icon.setCrop().setY(this.o.iconY ?? 2);
      }
      this.hue.colorMatrix.reset();
      if (hue) this.hue.colorMatrix.hue(hue);
    }
    const corner = opts.corner ?? '';
    this.corner.setText(corner);
    this.cornerBg.setVisible(corner.length > 0).setSize(corner.length * 8 + 1, 9);
    this.label.setText(label).setTint(opts.labelColor ?? 0xffffff);
    const iconW = opts.costIcon ? 9 : 0;
    const left = Math.floor((this.o.w - (label.length * 8 + iconW)) / 2);
    this.costIcon.setVisible(!!opts.costIcon).setX(left);
    if (opts.costIcon) this.costIcon.setTexture(opts.costIcon);
    this.label.setX(left + iconW);
    this.labelBg.setVisible(label.length > 0).setX(left - 2).setSize(label.length * 8 + iconW + 3, 10);
    return this;
  }

  /** `dimmed`: another tile of the card is active, so this one steps back. */
  setState(enabled: boolean, active = false, dimmed = false): this {
    this.enabled = enabled;
    this.active = active;
    this.icon.setAlpha(!enabled ? 0.35 : dimmed ? 0.55 : 1);
    this.badges.forEach((b) => b.setAlpha(enabled && !dimmed ? 1 : 0.5));
    this.frame.setVisible(active);
    this.refresh();
    return this;
  }

  setVisible(visible: boolean): this {
    this.root.setVisible(visible);
    if (!visible && this.hovered) this.hover(false);
    return this;
  }

  get isHovered(): boolean {
    return this.hovered && this.root.visible;
  }

  private hover(over: boolean): void {
    this.hovered = over;
    this.refresh();
    this.o.onHover(over);
  }

  private refresh(): void {
    this.bg.setTexture(this.active ? this.textures.slotActive : this.hovered ? this.textures.slotHover : this.textures.slot);
  }
}

/** Small square button showing an icon or a glyph (mode switches, help). */
export class MiniButton {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText;
  private readonly textures: Record<'slot' | 'slotHover' | 'slotActive', string>;
  private readonly onHover: (over: boolean) => void;
  private hovered = false;
  private active = false;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    o: { x: number; y: number; size: number; icon?: string; text?: string; onClick: () => void; onHover: (over: boolean) => void },
  ) {
    this.onHover = o.onHover;
    this.textures = {
      slot: panelTexture(scene, o.size, o.size, 'slot'),
      slotHover: panelTexture(scene, o.size, o.size, 'slotHover'),
      slotActive: panelTexture(scene, o.size, o.size, 'slotActive'),
    };
    const mid = o.size / 2;
    this.bg = scene.add.image(o.x, o.y, this.textures.slot).setOrigin(0, 0);
    this.face = o.icon
      ? scene.add.image(o.x + mid, o.y + mid, o.icon)
      : scene.add.bitmapText(o.x + mid + 1, o.y + mid + 1, FONT, o.text ?? '').setOrigin(0.5).setTint(0xfff080);
    this.bg
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => ((this.hovered = true), this.refresh(), o.onHover(true)))
      .on('pointerout', () => ((this.hovered = false), this.refresh(), o.onHover(false)))
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (this.enabled) o.onClick();
      });
  }

  setState(enabled: boolean, active = false): this {
    if (enabled !== this.enabled || active !== this.active) {
      this.enabled = enabled;
      this.active = active;
      this.face.setAlpha(enabled ? 1 : 0.35);
      this.refresh();
    }
    return this;
  }

  setVisible(visible: boolean): this {
    this.bg.setVisible(visible);
    this.face.setVisible(visible);
    if (!visible && this.hovered) {
      this.hovered = false;
      this.refresh();
      this.onHover(false);
    }
    return this;
  }

  private refresh(): void {
    this.bg.setTexture(this.active ? this.textures.slotActive : this.hovered ? this.textures.slotHover : this.textures.slot);
  }
}

/** Two-line text tab (view switcher) that can flash to signal activity. */
export class TabButton {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly textures: Record<'slot' | 'slotHover' | 'slotActive', string>;
  private hovered = false;
  private active = false;
  private flashUntil = 0;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    this.textures = {
      slot: panelTexture(scene, w, h, 'slot'),
      slotHover: panelTexture(scene, w, h, 'slotHover'),
      slotActive: panelTexture(scene, w, h, 'slotActive'),
    };
    this.bg = scene.add.image(x, y, this.textures.slot).setOrigin(0, 0);
    this.text = scene.add.bitmapText(x + w / 2, y + h / 2 + 1, FONT, label).setOrigin(0.5).setCenterAlign().setLineSpacing(1);
    this.bg
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => ((this.hovered = true), this.refresh()))
      .on('pointerout', () => ((this.hovered = false), this.refresh()))
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        onClick();
      });
  }

  setActive(active: boolean): void {
    if (active !== this.active) {
      this.active = active;
      this.refresh();
    }
    this.text.setTint(this.scene.time.now < this.flashUntil && Math.floor(this.scene.time.now / 120) % 2 === 0 ? 0xff5050 : 0xffffff);
  }

  flash(ms = 600): void {
    this.flashUntil = this.scene.time.now + ms;
  }

  private refresh(): void {
    this.bg.setTexture(this.active ? this.textures.slotActive : this.hovered ? this.textures.slotHover : this.textures.slot);
  }
}
