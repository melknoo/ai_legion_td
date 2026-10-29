import Phaser from 'phaser';
import { FONT } from '../scenes/BootScene.ts';

/** Coloured text or a tinted icon, followed by `gap` pixels. */
export type Segment = { text: string; color?: number; gap?: number } | { icon: string; tint?: number; gap?: number };

/** Inline currency tokens for HUD texts: "TIER 1 {coin}25". */
const TOKEN_ICONS: Record<string, string> = { coin: 'icon-coin', log: 'icon-log', food: 'icon-food' };

/** Text with {coin}/{log}/{food} tokens as segments, icons sitting tight against their numbers. */
export function richText(text: string, color?: number): Segment[] {
  return text
    .split(/\{(coin|log|food)\}/)
    .map((part, i): Segment | null => (i % 2 ? { icon: TOKEN_ICONS[part]!, gap: 1 } : part ? { text: part, color, gap: 0 } : null))
    .filter((s): s is Segment => s !== null);
}

/** One line of mixed coloured text and tinted icons, laid out left to right. */
export class RichLine {
  readonly root: Phaser.GameObjects.Container;
  private readonly texts: Phaser.GameObjects.BitmapText[] = [];
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private shown = '';

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.root = scene.add.container(x, y);
  }

  set(segments: Segment[]): this {
    const key = JSON.stringify(segments);
    if (key === this.shown) return this;
    this.shown = key;
    let x = 0;
    let t = 0;
    let i = 0;
    for (const s of segments) {
      if ('icon' in s) {
        const img = this.icons[i++] ?? this.addIcon();
        img.setTexture(s.icon).setPosition(x, 0).setTint(s.tint ?? 0xffffff).setVisible(true);
        x += img.width + (s.gap ?? 2);
      } else {
        const txt = this.texts[t++] ?? this.addText();
        txt.setText(s.text).setPosition(x, 0).setTint(s.color ?? 0xffffff).setVisible(true);
        x += s.text.length * 8 + (s.gap ?? 4);
      }
    }
    this.icons.slice(i).forEach((o) => o.setVisible(false));
    this.texts.slice(t).forEach((o) => o.setVisible(false));
    return this;
  }

  setVisible(visible: boolean): this {
    this.root.setVisible(visible);
    return this;
  }

  private addIcon(): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    this.root.add(img);
    this.icons.push(img);
    return img;
  }

  private addText(): Phaser.GameObjects.BitmapText {
    const txt = this.scene.add.bitmapText(0, 0, FONT, '');
    this.root.add(txt);
    this.texts.push(txt);
    return txt;
  }
}
