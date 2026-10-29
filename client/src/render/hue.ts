import type Phaser from 'phaser';

/** The 3x3 hue rotation of Phaser's ColorMatrix.hue(), so baked colours match the old filter. */
function hueMatrix(degrees: number): number[] {
  const r = (degrees / 180) * Math.PI;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const [lr, lg, lb] = [0.213, 0.715, 0.072];
  return [
    lr + cos * (1 - lr) + sin * -lr, lg + cos * -lg + sin * -lg, lb + cos * -lb + sin * (1 - lb),
    lr + cos * -lr + sin * 0.143, lg + cos * (1 - lg) + sin * 0.14, lb + cos * -lb + sin * -0.283,
    lr + cos * -lr + sin * -(1 - lr), lg + cos * -lg + sin * lg, lb + cos * (1 - lb) + sin * lb,
  ];
}

let scratch: CanvasRenderingContext2D | undefined;

/**
 * Copies texture `src` (with its spritesheet frames) to `dst` with the hues rotated. A filter
 * would do the same per sprite and frame, but every filtered object costs an extra render
 * pass, which mobile GPUs feel badly with dozens of tinted units on screen.
 */
export function bakeHue(textures: Phaser.Textures.TextureManager, src: string, dst: string, degrees: number): void {
  if (textures.exists(dst) || !textures.exists(src)) return;
  const source = textures.get(src);
  const img = source.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const tex = textures.createCanvas(dst, img.width, img.height)!;
  // Pixel work on one CPU-side canvas: reading back from GPU-backed canvases stalls per call.
  scratch ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  scratch.canvas.width = img.width;
  scratch.canvas.height = img.height;
  scratch.drawImage(img, 0, 0);
  const pixels = scratch.getImageData(0, 0, img.width, img.height);
  const px = pixels.data;
  const m = hueMatrix(degrees);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
    // Uint8ClampedArray rounds and clamps on its own.
    px[i] = m[0]! * r + m[1]! * g + m[2]! * b;
    px[i + 1] = m[3]! * r + m[4]! * g + m[5]! * b;
    px[i + 2] = m[6]! * r + m[7]! * g + m[8]! * b;
  }
  tex.getContext().putImageData(pixels, 0, 0);
  for (const name of source.getFrameNames()) {
    const f = source.get(name);
    tex.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
  }
  tex.refresh();
}
