import type Phaser from 'phaser';

/**
 * White pixel ellipse texture (fill plus an optional 1 px rim), tinted per use. Shadows and
 * rings as images instead of Ellipse shapes keep every unit in the sprite pipeline, so the
 * renderer doesn't switch between shape and texture drawing for each unit on the field.
 */
export function ellipseTexture(scene: Phaser.Scene, w: number, h: number, fillAlpha: number, rimAlpha = 0): string {
  w = Math.max(2, Math.round(w));
  h = Math.max(2, Math.round(h));
  const key = `ell-${w}x${h}-${fillAlpha}-${rimAlpha}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  const inside = (x: number, y: number) => {
    const nx = (x + 0.5 - w / 2) / (w / 2);
    const ny = (y + 0.5 - h / 2) / (h / 2);
    return x >= 0 && y >= 0 && x < w && y < h && nx * nx + ny * ny <= 1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const rim = rimAlpha > 0 && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * (rim ? rimAlpha : fillAlpha));
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}
