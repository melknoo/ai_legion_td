import type Phaser from 'phaser';

// Menus and HUD are laid out at 480x270 and drawn at 2x on a 960x540 canvas; the canvas
// is then scaled by an integer zoom. The battlefield uses its own 3x zoom on that canvas.
export const VIEW_W = 480;
export const VIEW_H = 270;
export const UI_ZOOM = 2;
export const CANVAS_W = VIEW_W * UI_ZOOM;
export const CANVAS_H = VIEW_H * UI_ZOOM;

/** Battlefield viewport between the top bar and the bottom panels (layout pixels). */
export const FIELD_TOP = 25;
export const FIELD_H = 160;
/** Canvas pixels per field pixel: 16 px sprites at 3x leave room above the top row. */
export const FIELD_ZOOM = 3;

/** Point a scene's camera at the 480x270 layout. */
export function layoutCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setOrigin(0, 0).setZoom(UI_ZOOM);
}

/** World units -> field pixels (one 64-unit cell = one 16 px tile). */
export const SCALE = 0.25;
