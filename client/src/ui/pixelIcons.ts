import Phaser from 'phaser';

// Tiny hand-drawn icons for inline use next to 8px text ('.' = transparent).
const PATTERNS: Record<string, { rows: string[]; palette: Record<string, string> }> = {
  'icon-log': {
    rows: ['...ddd.', '..dbbbd', '.dbbbdl', 'dbbbdll', 'dbbdll.', 'dbdll..', '.dd....'],
    palette: { d: '#5a3418', b: '#a0642c', l: '#e0b070' },
  },
  // Reach of a ranged attack: a drawn bow with its arrow.
  'icon-bow': {
    rows: ['..b.....', '.s.b....', 's...b.h.', 'aaaaaaah', 's...b.h.', '.s.b....', '..b.....'],
    palette: { b: '#f0a048', s: '#e8e8f8', a: '#d8c8a8', h: '#ffffff' },
  },
  // Supply (food): a drumstick.
  'icon-food': {
    rows: ['..bbb..', '.bmmmb.', '.bmlmb.', '.bmmmb.', '..bmb..', '...w...', '..w.w..'],
    palette: { b: '#6a2c18', m: '#c8683a', l: '#f0a070', w: '#f0ead8' },
  },
  // King upgrades tab.
  'icon-crown': {
    rows: ['.......', 'y..y..y', 'yy.y.yy', 'yyyyyyy', 'ydyrydy', 'yyyyyyy', '.......'],
    palette: { y: '#f8d048', d: '#b07818', r: '#e04848' },
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
