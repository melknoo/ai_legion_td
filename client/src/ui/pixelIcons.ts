import Phaser from 'phaser';

// Tiny hand-drawn icons for inline use next to 8px text ('.' = transparent).
const PATTERNS: Record<string, { rows: string[]; palette: Record<string, string> }> = {
  'icon-log': {
    rows: ['...ddd.', '..dbbbd', '.dbbbdl', 'dbbbdll', 'dbbdll.', 'dbdll..', '.dd....'],
    palette: { d: '#5a3418', b: '#a0642c', l: '#e0b070' },
  },
  'icon-sword': {
    rows: ['......w', '.....w.', '....w..', '.g.w...', '..g....', '.g.g...', 'g......'],
    palette: { w: '#e8eef8', g: '#d0a040' },
  },
  'icon-shield': {
    rows: ['.bbbbb.', 'bwwbbbb', 'bwbbbbb', 'bbbbbbb', '.bbbbb.', '..bbb..', '...b...'],
    palette: { b: '#6080d0', w: '#c8d8ff' },
  },
  // Range: a double-headed arrow, unlike the pierce attack icon.
  'icon-range': {
    rows: ['.......', '.......', '.w...w.', 'wwwwwww', '.w...w.', '.......', '.......'],
    palette: { w: '#e8eef8' },
  },
  // Supply (food): a drumstick.
  'icon-food': {
    rows: ['..bbb..', '.bmmmb.', '.bmlmb.', '.bmmmb.', '..bmb..', '...w...', '..w.w..'],
    palette: { b: '#6a2c18', m: '#c8683a', l: '#f0a070', w: '#f0ead8' },
  },
  // Damage and armor type icons, drawn light so they can be tinted per type.
  'type-normal': {
    rows: ['......w', '.....w.', '....w..', '.w.w...', '..w....', '.w.w...', 'w......'],
    palette: { w: '#ffffff' },
  },
  'type-pierce': {
    rows: ['...www.', '....ww.', '...w.w.', '..w....', '.w.....', 'w......', '.......'],
    palette: { w: '#ffffff' },
  },
  'type-siege': {
    rows: ['..www..', '.wwwww.', 'wwgwwww', 'wgwwwww', 'wwwwwww', '.wwwww.', '..www..'],
    palette: { w: '#ffffff', g: '#a0a0a0' },
  },
  'type-magic': {
    rows: ['...w...', '..www..', '.wwgww.', 'wwgwwww', '.wwwww.', '..www..', '...w...'],
    palette: { w: '#ffffff', g: '#a0a0a0' },
  },
  'type-chaos': {
    rows: ['w..w..w', '.w.w.w.', '..www..', 'wwwwwww', '..www..', '.w.w.w.', 'w..w..w'],
    palette: { w: '#ffffff' },
  },
  'type-armor': {
    rows: ['wwwwwww', 'wgwwwww', 'wgwwwww', 'wwwwwww', '.wwwww.', '..www..', '...w...'],
    palette: { w: '#ffffff', g: '#a0a0a0' },
  },
  // FF6-style pointing glove.
  'icon-hand': {
    rows: [
      '.#####......',
      '#wwwww#####.',
      '#wwwwwwwwww#',
      '#wwww######.',
      '#wwwwwww#...',
      '#wwwww##....',
      '.#wwwww#....',
      '..#####.....',
    ],
    palette: { '#': '#303048', w: '#f8f8f8' },
  },
};

export function makePixelIcons(scene: Phaser.Scene): void {
  for (const [key, { rows, palette }] of Object.entries(PATTERNS)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, rows[0]!.length, rows.length)!;
    const ctx = tex.getContext();
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const color = palette[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    tex.refresh();
  }
}
