import Phaser from 'phaser';

/** Procedural 16x16 ground tiles (grass for lanes and menus, stone for king arenas). */
export function makeGroundTextures(scene: Phaser.Scene): void {
  const tile = (key: string, base: string, dark: string, light: string, seed: number) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, 16, 16)!;
    const ctx = tex.getContext();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 16, 16);
    let s = seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = rnd() < 0.6 ? dark : light;
      ctx.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, rnd() < 0.3 ? 2 : 1);
    }
    tex.refresh();
  };
  tile('grass', '#5c9c3c', '#4a8430', '#78b850', 7);
  tile('stone', '#6c6878', '#5a5666', '#86829a', 11);
}
