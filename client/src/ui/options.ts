import type Phaser from 'phaser';
import { FONT } from '../scenes/BootScene.ts';
import { settings, updateSettings } from '../settings.ts';
import { ff6Window } from './ff6Window.ts';
import { TextButton } from './TextButton.ts';
import { setTipsEnabled, tipsEnabled } from './Tutorial.ts';

export interface OptionItem {
  label(): string;
  /** Left/right (or a click on the left/right half): -1 / +1. Toggles ignore the direction. */
  change(step: number): void;
}

/**
 * Step for a click on an option line "NAME < VALUE >" drawn from `textX`: -1 left of the
 * middle between the arrows, +1 right of it (the whole value sits in the line's right half).
 */
export function clickStep(label: string, textX: number, clickX: number): number {
  const lt = label.indexOf('<');
  const gt = label.lastIndexOf('>');
  if (lt < 0 || gt < 0) return 1;
  return clickX < textX + ((lt + gt + 1) / 2) * CHAR_W ? -1 : 1;
}

/** Width of a glyph in the bitmap font. */
const CHAR_W = 8;

const onOff = (on: boolean) => (on ? 'ON' : 'OFF');

export const OPTION_ITEMS: OptionItem[] = [
  { label: () => `SOUND        < ${onOff(settings().sound)} >`, change: () => updateSettings({ sound: !settings().sound }) },
  {
    label: () => `VOLUME       < ${String(Math.round(settings().volume * 10)).padStart(2)} >`,
    change: (step) => updateSettings({ volume: Math.min(1, Math.max(0, Math.round(settings().volume * 10 + step) / 10)) }),
  },
  { label: () => `SCREEN SHAKE < ${onOff(settings().shake)} >`, change: () => updateSettings({ shake: !settings().shake }) },
  { label: () => `TIPS         < ${onOff(tipsEnabled())} >`, change: () => setTipsEnabled(!tipsEnabled()) },
];

const W = 196;
const ROW = 14;

/**
 * In-game options window: click left or right of the middle between a line's arrows to step it; CLOSE (or O / Esc)
 * closes it. Returns a function that removes it.
 */
export function optionsWindow(scene: Phaser.Scene, cx: number, cy: number, onClose: () => void): () => void {
  const h = OPTION_ITEMS.length * ROW + 40;
  const x = Math.round(cx - W / 2);
  const y = Math.round(cy - h / 2);
  const depth = 21000;
  const parts: { destroy(): void }[] = [
    ff6Window(scene, x, y, W, h).setDepth(depth),
    scene.add.bitmapText(x + W / 2, y + 6, FONT, 'OPTIONS').setOrigin(0.5, 0).setTint(0xfff080).setDepth(depth),
  ];
  const lines = OPTION_ITEMS.map((item, i) => {
    const t = scene.add.bitmapText(x + 12, y + 20 + i * ROW, FONT, item.label()).setDepth(depth);
    const zone = scene.add.zone(x + 4, y + 17 + i * ROW, W - 8, ROW).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(depth);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      item.change(clickStep(t.text, t.x, p.worldX));
      lines.forEach((l, j) => l.setText(OPTION_ITEMS[j]!.label()));
    });
    parts.push(t, zone);
    return t;
  });
  parts.push(new TextButton(scene, x + W / 2 - 32, y + h - 21, 64, 'CLOSE', onClose).setDepth(depth));
  return () => parts.forEach((p) => p.destroy());
}
