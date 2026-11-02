import Phaser from 'phaser';
import type { GameView, TeamId } from '@legion/shared';
import { FIELD_H, FIELD_TOP, FIELD_ZOOM, UI_ZOOM, VIEW_W } from '../layout.ts';
import { LANE_PX, type FieldMap } from '../render/fieldMap.ts';
import { FONT } from '../scenes/BootScene.ts';
import { seatColor, teamColor } from './playerColors.ts';

/** What the battlefield hands to the minimap. */
export interface MinimapLink {
  map: FieldMap;
  /** Field-pixel rows the battlefield shows. */
  view(): { top: number; bottom: number };
  /** Centres the battlefield on a field-pixel row; it settles on the nearest area once let go. */
  lookAt(fy: number): void;
  /** Mouse wheel over the minimap scrolls like over the battlefield. */
  wheel(dy: number): void;
}

/** Inner width in layout pixels: the strip right of the lane, where the field shows only grass. */
const WIDTH = 32;
const LANE_FILL = 0x1e3a24;
const ARENA_FILL = 0x34344a;
const CREEP_DOT = 0xff4040;
const SEND_DOT = 0xffa040;
/** A king's area blinks red this long after it lost HP. */
const KING_FLASH_MS = 600;
/** Layout pixels per field pixel. */
const FIELD_TO_LAYOUT = FIELD_ZOOM / UI_ZOOM;

/**
 * The whole map at a glance in the battlefield's right margin: every lane and arena, a dot per
 * unit and a frame around what the battlefield shows. Click or drag to look elsewhere. It also
 * writes the areas' names over the battlefield, above the field camera's vignette so they stay bright.
 */
export class Minimap {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.BitmapText[];
  private readonly x: number;
  private readonly y: number;
  private readonly scale: number;
  private readonly lastKingHp: Record<TeamId, number> = { 0: Infinity, 1: Infinity };
  private readonly kingHurtAt: Record<TeamId, number> = { 0: -Infinity, 1: -Infinity };
  private dragging = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameView,
    private readonly player: number,
    private readonly link: MinimapLink,
  ) {
    this.scale = Math.min(WIDTH / LANE_PX.w, (FIELD_H - 4) / link.map.height);
    const w = Math.round(LANE_PX.w * this.scale) + 2;
    const h = Math.round(link.map.height * this.scale) + 2;
    this.x = VIEW_W - 2 - w;
    this.y = FIELD_TOP + 2;
    this.g = scene.add.graphics().setDepth(19000);
    this.labels = link.map.slots.map((slot) => scene.add.bitmapText(6, 0, FONT, slot.label).setOrigin(0, 1).setTint(slot.color));
    const look = (p: Phaser.Input.Pointer) => {
      const at = scene.cameras.main.getWorldPoint(p.x, p.y);
      link.lookAt((at.y - this.y - 1) / this.scale);
    };
    scene.add
      .zone(this.x, this.y, w, h)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.dragging = true;
        look(p);
      })
      .on('wheel', (_p: Phaser.Input.Pointer, _dx: number, dy: number) => link.wheel(dy));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.dragging && p.isDown && look(p));
    scene.input.on('pointerup', () => (this.dragging = false));
  }

  update(): void {
    const { map } = this.link;
    const s = this.scale;
    const now = this.scene.time.now;
    const ox = this.x + 1;
    const oy = this.y + 1;
    const w = Math.round(LANE_PX.w * s);
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.6).fillRect(this.x, this.y, w + 2, Math.round(map.height * s) + 2);
    for (const team of [0, 1] as const) {
      const hp = this.game.king(team).hp;
      if (hp < this.lastKingHp[team]) this.kingHurtAt[team] = now;
      this.lastKingHp[team] = hp;
    }
    // Areas framed in their owner's colour (yours gold); a hurt king's area blinks red.
    for (const slot of map.slots) {
      const x = ox + Math.round(slot.x * s);
      const y = oy + Math.round(slot.y * s);
      const sw = Math.round(slot.w * s);
      const sh = Math.round(slot.h * s);
      const hurt = slot.team !== undefined && now < this.kingHurtAt[slot.team] + KING_FLASH_MS && Math.floor(now / 120) % 2 === 0;
      g.fillStyle(hurt ? 0xff4040 : slot.color, 1).fillRect(x, y, sw, sh);
      g.fillStyle(slot.kind === 'lane' ? LANE_FILL : ARENA_FILL, 1).fillRect(x + 1, y + 1, sw - 2, sh - 2);
    }
    // A dot per unit: fighters in their owner's colour, creeps red, sends orange, kings bigger.
    for (const u of this.game.units.values()) {
      if (u.dead) continue;
      const p = map.toField(u.area, u.x, u.y);
      const x = ox + Math.floor(p.x * s);
      const y = oy + Math.floor(p.y * s);
      if (u.kind === 'king') g.fillStyle(teamColor(u.team), 1).fillRect(x - 1, y - 1, 2, 2);
      else g.fillStyle(u.kind === 'fighter' ? seatColor(this.game, u.owner, this.player) : u.kind === 'merc' ? SEND_DOT : CREEP_DOT, 1).fillRect(x, y, 1, 1);
    }
    // What the battlefield shows, and the names of the areas in it, in the strip above each.
    const v = this.link.view();
    map.slots.forEach((slot, i) => {
      const bottom = Math.round(FIELD_TOP + (slot.y - 5 - v.top) * FIELD_TO_LAYOUT);
      this.labels[i]!.setY(bottom).setVisible(bottom - 8 >= FIELD_TOP && bottom <= FIELD_TOP + FIELD_H);
    });
    const top = oy + Math.round(v.top * s);
    const bottom = oy + Math.round(v.bottom * s);
    g.fillStyle(0xffffff, 0.9)
      .fillRect(ox - 1, top, w + 2, 1)
      .fillRect(ox - 1, bottom - 1, w + 2, 1)
      .fillRect(ox - 1, top, 1, bottom - top)
      .fillRect(ox + w, top, 1, bottom - top);
  }
}
