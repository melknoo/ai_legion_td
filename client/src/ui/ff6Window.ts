import Phaser from 'phaser';

export type PanelStyle = 'window' | 'slot' | 'slotHover' | 'slotActive';

const STYLES: Record<PanelStyle, { top: string; bottom: string; outer: string; inner: string }> = {
  window: { top: '#5a6ee0', bottom: '#141c78', outer: '#e8e8f0', inner: '#9098b0' },
  slot: { top: '#3c4cc0', bottom: '#1c2684', outer: '#8890b8', inner: '#2a3490' },
  slotHover: { top: '#5468e0', bottom: '#2a3698', outer: '#f0f0ff', inner: '#4a58b8' },
  slotActive: { top: '#6a5a20', bottom: '#3a300c', outer: '#ffe060', inner: '#b09030' },
};

/**
 * SNES-JRPG menu window: vertical blue gradient with a light double border and rounded corners.
 * Rendered once into a canvas texture per size and style.
 */
export function ff6Window(scene: Phaser.Scene, x: number, y: number, w: number, h: number, style: PanelStyle = 'window'): Phaser.GameObjects.Image {
  return scene.add.image(x, y, panelTexture(scene, w, h, style)).setOrigin(0, 0);
}

export function panelTexture(scene: Phaser.Scene, w: number, h: number, style: PanelStyle): string {
  const key = `ff6-${style}-${w}x${h}`;
  if (!scene.textures.exists(key)) {
    const s = STYLES[style];
    const tex = scene.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, s.top);
    grad.addColorStop(1, s.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(2, 2, w - 4, h - 4);
    // Outer light border with clipped corners, inner darker line.
    ctx.fillStyle = s.outer;
    ctx.fillRect(2, 0, w - 4, 1);
    ctx.fillRect(2, h - 1, w - 4, 1);
    ctx.fillRect(0, 2, 1, h - 4);
    ctx.fillRect(w - 1, 2, 1, h - 4);
    ctx.fillRect(1, 1, 1, 1);
    ctx.fillRect(w - 2, 1, 1, 1);
    ctx.fillRect(1, h - 2, 1, 1);
    ctx.fillRect(w - 2, h - 2, 1, 1);
    ctx.fillStyle = s.inner;
    ctx.fillRect(2, 1, w - 4, 1);
    ctx.fillRect(2, h - 2, w - 4, 1);
    ctx.fillRect(1, 2, 1, h - 4);
    ctx.fillRect(w - 2, 2, 1, h - 4);
    tex.refresh();
  }
  return key;
}
