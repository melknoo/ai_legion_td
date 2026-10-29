import Phaser from 'phaser';
import type { GameView } from '@legion/shared';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { ARMOR_ICON, ARMOR_INFO, ARMOR_ORDER, ATTACK_INFO, ATTACK_ORDER, multiplierColor } from './typeInfo.ts';

const LABEL_W = 70;
const COL_W = 52;
const ROW_H = 11;
const PAD = 8;

/**
 * FF6 window with the full attack-vs-armor damage table. The coming wave's armor
 * column is highlighted; your builder's attack types are starred.
 */
export function typeChart(scene: Phaser.Scene, game: GameView, player: number, cx: number, cy: number): Phaser.GameObjects.Container {
  const table = game.data.damageTable;
  const w = PAD * 2 + LABEL_W + ARMOR_ORDER.length * COL_W;
  const h = 34 + ATTACK_ORDER.length * ROW_H + 28;
  const parts: Phaser.GameObjects.GameObject[] = [ff6Window(scene, 0, 0, w, h)];
  const text = (x: number, y: number, s: string, color = 0xffffff) => {
    const t = scene.add.bitmapText(x, y, FONT, s).setTint(color);
    parts.push(t);
    return t;
  };
  const icon = (x: number, y: number, key: string, tint: number) => parts.push(scene.add.image(x, y, key).setOrigin(0, 0).setTint(tint));

  text(PAD, 6, 'DAMAGE: ATTACK VS ARMOR', 0xfff080);
  const wave = game.data.waves[game.wave - 1];
  const creep = wave ? game.data.units[wave.creep] : undefined;
  const top = 32;
  ARMOR_ORDER.forEach((armor, c) => {
    const x = PAD + LABEL_W + c * COL_W;
    const info = ARMOR_INFO[armor];
    if (creep?.armorType === armor) {
      parts.push(scene.add.rectangle(x, 17, COL_W - 2, top - 13 + ATTACK_ORDER.length * ROW_H, 0xffffff, 0.14).setOrigin(0, 0));
    }
    icon(x + (COL_W - 2) / 2 - 4, 17, ARMOR_ICON, info.color);
    text(x + (COL_W - 2 - info.name.length * 8) / 2, 25, info.name, info.color);
  });
  // Every attack type the builder can field, upgrades included.
  const mine = new Set<string>();
  const seen = new Set<string>();
  const queue = [...game.players[player]!.fighters];
  for (const id of queue) {
    const d = game.data.units[id];
    if (!d || seen.has(id)) continue;
    seen.add(id);
    mine.add(d.attack.type);
    queue.push(...(d.upgradesTo ?? []));
  }
  ATTACK_ORDER.forEach((attack, r) => {
    const y = top + 4 + r * ROW_H;
    const info = ATTACK_INFO[attack];
    if (mine.has(attack)) text(PAD, y, '*', 0xfff080);
    icon(PAD + 9, y, info.icon, info.color);
    text(PAD + 19, y, info.name, info.color);
    ARMOR_ORDER.forEach((armor, c) => {
      const m = table[attack][armor];
      const s = `${Math.round(m * 100)}%`;
      text(PAD + LABEL_W + c * COL_W + (COL_W - 2 - s.length * 8) / 2, y, s, multiplierColor(m));
    });
  });
  const foot = top + 6 + ATTACK_ORDER.length * ROW_H;
  if (creep) {
    const name = ARMOR_INFO[creep.armorType];
    const lead = `WAVE ${game.wave}: `;
    text(PAD, foot, lead, 0xc0c8f0);
    text(PAD + lead.length * 8, foot, name.name, name.color);
  }
  text(w - PAD - 'T: CLOSE'.length * 8, foot, 'T: CLOSE', 0xc0c8f0);
  text(PAD, foot + 10, '* YOUR ATTACK TYPES', 0xc0c8f0);
  return scene.add.container(Math.round(cx - w / 2), Math.round(cy - h / 2), parts).setDepth(20001);
}
