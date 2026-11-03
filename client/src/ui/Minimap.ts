import Phaser from 'phaser';
import type { GameView, TeamId } from '@legion/shared';
import { FIELD_H, FIELD_TOP, FIELD_ZOOM, HUD_H, HUD_Y, UI_ZOOM } from '../layout.ts';
import { LANE_PX, MAP_GAP, type FieldMap } from '../render/fieldMap.ts';
import { FONT } from '../scenes/BootScene.ts';
import { ff6Window } from './ff6Window.ts';
import { HUD_GFX_DEPTH } from './Hud.ts';
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

/** The minimap's window: the bottom right HUD panel (layout pixels). */
export const MINIMAP_BOX = { x: 426, y: HUD_Y, w: 52, h: HUD_H };
/** Window border; the map sits inside it. */
const PAD = 3;
const LANE_FILL = 0x1e3a24;
const ARENA_FILL = 0x34344a;
const CREEP_DOT = 0xff4040;
const SEND_DOT = 0xffa040;
/** A king's area blinks red this long after it lost HP. */
const KING_FLASH_MS = 600;
/** Layout pixels per field pixel. */
const FIELD_TO_LAYOUT = FIELD_ZOOM / UI_ZOOM;
/** Area names sit this many field pixels above their area, clear of the top row's heads. */
const LABEL_ABOVE = 12;

/**
 * The whole map at a glance in the HUD: every lane and arena as a bar (top to bottom as on the
 * battlefield), a dot per unit and a frame around what the battlefield shows. Each area gets the
 * same height however many there are, so lanes are squeezed rather than tiny. Click or drag to
 * look elsewhere. It also writes the areas' names over the battlefield, above the field camera's
 * vignette so they stay bright.
 */
export class Minimap {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.BitmapText[];
  private readonly x = MINIMAP_BOX.x + PAD;
  private readonly w = MINIMAP_BOX.w - 2 * PAD;
  /** First row of the first area. */
  private readonly top: number;
  /** Rows per area, the 1 px gap above it included. */
  private readonly pitch: number;
  /** Layout pixels per field pixel across. */
  private readonly sx: number;
  private readonly lastKingHp: Record<TeamId, number> = { 0: Infinity, 1: Infinity };
  private readonly kingHurtAt: Record<TeamId, number> = { 0: -Infinity, 1: -Infinity };
  private dragging = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameView,
    private readonly player: number,
    private readonly link: MinimapLink,
  ) {
    const n = link.map.slots.length;
    const inner = MINIMAP_BOX.h - 2 * PAD;
    this.pitch = Math.floor((inner + 1) / n);
    this.top = MINIMAP_BOX.y + PAD + Math.floor((inner - (n * this.pitch - 1)) / 2);
    this.sx = this.w / LANE_PX.w;
    ff6Window(scene, MINIMAP_BOX.x, MINIMAP_BOX.y, MINIMAP_BOX.w, MINIMAP_BOX.h);
    this.g = scene.add.graphics().setDepth(HUD_GFX_DEPTH);
    this.labels = link.map.slots.map((slot) => scene.add.bitmapText(6, 0, FONT, slot.label).setOrigin(0, 1).setTint(slot.color));
    const look = (p: Phaser.Input.Pointer) => link.lookAt(this.toField(scene.cameras.main.getWorldPoint(p.x, p.y).y));
    scene.add
      .zone(MINIMAP_BOX.x, MINIMAP_BOX.y, MINIMAP_BOX.w, MINIMAP_BOX.h)
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

  /** Field-pixel row -> minimap row: each area with the gap above it fills one `pitch`. */
  private toMini(fy: number): number {
    const slots = this.link.map.slots;
    const found = slots.findIndex((s) => fy < s.y + s.h);
    const i = found < 0 ? slots.length - 1 : found;
    const s = slots[i]!;
    return this.top - 1 + (i + (fy - (s.y - MAP_GAP)) / (s.h + MAP_GAP)) * this.pitch;
  }

  private toField(my: number): number {
    const slots = this.link.map.slots;
    const rel = (my - (this.top - 1)) / this.pitch;
    const i = Phaser.Math.Clamp(Math.floor(rel), 0, slots.length - 1);
    const s = slots[i]!;
    return s.y - MAP_GAP + (rel - i) * (s.h + MAP_GAP);
  }

  update(): void {
    const { map } = this.link;
    const now = this.scene.time.now;
    const g = this.g.clear();
    for (const team of [0, 1] as const) {
      const hp = this.game.king(team).hp;
      if (hp < this.lastKingHp[team]) this.kingHurtAt[team] = now;
      this.lastKingHp[team] = hp;
    }
    // Areas framed in their owner's colour (yours gold); a hurt king's area blinks red.
    map.slots.forEach((slot, i) => {
      const x = this.x + Math.round(slot.x * this.sx);
      const y = this.top + i * this.pitch;
      const w = Math.round(slot.w * this.sx);
      const h = this.pitch - 1;
      const hurt = slot.team !== undefined && now < this.kingHurtAt[slot.team] + KING_FLASH_MS && Math.floor(now / 120) % 2 === 0;
      g.fillStyle(hurt ? 0xff4040 : slot.color, 1).fillRect(x, y, w, h);
      g.fillStyle(slot.kind === 'lane' ? LANE_FILL : ARENA_FILL, 1).fillRect(x + 1, y + 1, w - 2, h - 2);
    });
    // A dot per unit: fighters in their owner's colour, creeps red, sends orange, kings bigger.
    for (const u of this.game.units.values()) {
      if (u.dead) continue;
      const p = map.toField(u.area, u.x, u.y);
      const x = this.x + Math.floor(p.x * this.sx);
      const y = Math.floor(this.toMini(p.y));
      if (u.kind === 'king') g.fillStyle(teamColor(u.team), 1).fillRect(x - 1, y - 1, 2, 2);
      else g.fillStyle(u.kind === 'fighter' ? seatColor(this.game, u.owner, this.player) : u.kind === 'merc' ? SEND_DOT : CREEP_DOT, 1).fillRect(x, y, 1, 1);
    }
    // What the battlefield shows, and the names of the areas in it, in the strip above each.
    const v = this.link.view();
    map.slots.forEach((slot, i) => {
      const bottom = Math.round(FIELD_TOP + (slot.y - LABEL_ABOVE - v.top) * FIELD_TO_LAYOUT);
      this.labels[i]!.setY(bottom).setVisible(bottom - 8 >= FIELD_TOP && bottom <= FIELD_TOP + FIELD_H);
    });
    const top = Math.round(this.toMini(v.top));
    const bottom = Math.max(top + 2, Math.round(this.toMini(v.bottom)));
    g.fillStyle(0xffffff, 0.9)
      .fillRect(this.x - 1, top, this.w + 2, 1)
      .fillRect(this.x - 1, bottom, this.w + 2, 1)
      .fillRect(this.x - 1, top, 1, bottom - top)
      .fillRect(this.x + this.w, top, 1, bottom - top);
  }
}
