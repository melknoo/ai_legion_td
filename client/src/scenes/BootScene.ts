import Phaser from 'phaser';
import {
  ARROW_PATH, DIR, FONT_PATH, FX, ICONS, KING_SPRITES, KUNAI_PATH, PROJECTILES, SOUNDS, UNIT_SPRITES, WEAPONS,
  bossPath, characterPath, facesetPath, monsterPath, soundPath, spriteBaseKey, spriteKey, spriteSheets,
} from '../assets/manifest.ts';
import { bakeHue } from '../render/hue.ts';
import { makeGroundTextures } from '../render/groundTextures.ts';
import { layoutCamera } from '../layout.ts';
import { makePixelIcons } from '../ui/pixelIcons.ts';

export const FONT = 'font8';
const FONT_SOURCE = 'font8-src';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    layoutCamera(this);
    // FF6-style loading bar (the font is not loaded yet, so it's bar-only).
    const bar = this.add.graphics();
    this.load.on('progress', (p: number) => {
      bar.clear().fillStyle(0xe8e8f0, 1).fillRect(140, 130, 200, 10);
      bar.fillStyle(0x141c78, 1).fillRect(141, 131, 198, 8);
      bar.fillStyle(0x5a6ee0, 1).fillRect(141, 131, Math.round(198 * p), 8);
    });
    this.load.once('complete', () => bar.destroy());

    const sheet16 = { frameWidth: 16, frameHeight: 16 };
    const sprites = new Map(Object.values(UNIT_SPRITES).map((s) => [spriteBaseKey(s), s]));
    for (const [key, { folder, kind }] of sprites) {
      if (kind === 'character') {
        for (const anim of ['Walk', 'Idle', 'Attack', 'Dead'] as const) {
          this.load.spritesheet(`${key}-${anim}`, characterPath(folder, anim), sheet16);
        }
      } else {
        this.load.spritesheet(`${key}-Walk`, monsterPath(folder), sheet16);
      }
      this.load.image(`${key}-Face`, facesetPath(folder, kind));
    }
    for (const [key, path] of Object.entries(ICONS)) this.load.image(key, path);
    for (const folder of KING_SPRITES) {
      // Boss frames are 96 px wide (the sheets hold 6 idle / 4 hit frames).
      this.load.spritesheet(`${folder}-Idle`, bossPath(folder, 'Idle'), { frameWidth: 96, frameHeight: 48 });
      this.load.spritesheet(`${folder}-Hit`, bossPath(folder, 'Hit'), { frameWidth: 96, frameHeight: 48 });
      this.load.spritesheet(`${folder}-Attack`, bossPath(folder, 'AttackLeft'), { frameWidth: 96, frameHeight: 96 });
    }
    for (const [key, fx] of Object.entries(FX)) {
      this.load.spritesheet(`fx-${key}`, fx.path, { frameWidth: fx.w, frameHeight: fx.h });
    }
    this.load.image('arrow', ARROW_PATH);
    this.load.image('kunai', KUNAI_PATH);
    for (const key of SOUNDS) this.load.audio(key, soundPath(key));
    for (const [key, path] of Object.entries(WEAPONS)) this.load.image(`wpn-${key}`, path);
    for (const [key, p] of Object.entries(PROJECTILES)) this.load.spritesheet(`proj-${key}`, p.path, { frameWidth: p.w, frameHeight: p.h });
    this.load.image(FONT_SOURCE, FONT_PATH);
  }

  create(): void {
    this.makeLightFont();
    this.cache.bitmapFont.add(
      FONT,
      Phaser.GameObjects.RetroFont.Parse(this, {
        image: FONT,
        width: 8,
        height: 8,
        chars: Phaser.GameObjects.RetroFont.TEXT_SET1,
        charsPerRow: 15,
        'spacing.x': 0,
        'spacing.y': 0,
        'offset.x': 0,
        'offset.y': 0,
        lineSpacing: 1,
      }),
    );
    makePixelIcons(this);
    makeGroundTextures(this);
    for (const spec of Object.values(UNIT_SPRITES)) {
      if (!spec.hue) continue;
      for (const sheet of spriteSheets(spec)) bakeHue(this.textures, `${spriteBaseKey(spec)}-${sheet}`, `${spriteKey(spec)}-${sheet}`, spec.hue);
    }
    this.createAnimations();
    // Deep links: `?room=CODE` / `?online` open the lobby, `?builder=...` a solo game; otherwise the title.
    const params = new URLSearchParams(location.search);
    if (params.has('online') || params.has('room')) this.scene.start('lobby');
    else if (params.has('builder')) this.scene.start('battle');
    else this.scene.start('title');
  }

  /**
   * The pack's 8x8 font draws dark glyphs with a light rim. Swap the two tones for
   * FF6-style white letters with a dark outline, readable anywhere and tintable.
   */
  private makeLightFont(): void {
    const src = this.textures.get(FONT_SOURCE).getSourceImage() as HTMLImageElement;
    const tex = this.textures.createCanvas(FONT, src.width, src.height)!;
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, src.width, src.height);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3]! === 0) continue;
      const dark = px[i]! + px[i + 1]! + px[i + 2]! < 384;
      px[i] = px[i + 1] = px[i + 2] = dark ? 248 : 24;
      if (!dark) px[i + 2] = 48;
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  private createAnimations(): void {
    // Walk sheets: column = direction, row = frame.
    const column = (dir: number) => [0, 1, 2, 3].map((row) => row * 4 + dir);
    for (const spec of Object.values(UNIT_SPRITES)) {
      const key = `${spriteKey(spec)}-walk`;
      if (this.anims.exists(key)) continue;
      // Characters walk facing left, monsters facing right; the scene flips as needed.
      const dir = spec.kind === 'character' ? DIR.left : DIR.right;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(`${spriteKey(spec)}-Walk`, { frames: column(dir) }), frameRate: 8, repeat: -1 });
      // Monster fighters always loop their walk; before they fight they look down.
      if (spec.kind === 'monster') this.anims.create({ key: `${key}-down`, frames: this.anims.generateFrameNumbers(`${spriteKey(spec)}-Walk`, { frames: column(DIR.down) }), frameRate: 8, repeat: -1 });
    }
    for (const folder of KING_SPRITES) {
      this.anims.create({ key: `${folder}-idle`, frames: this.anims.generateFrameNumbers(`${folder}-Idle`), frameRate: 8, repeat: -1 });
      this.anims.create({ key: `${folder}-attack`, frames: this.anims.generateFrameNumbers(`${folder}-Attack`), frameRate: 12 });
    }
    for (const [key, fx] of Object.entries(FX)) {
      this.anims.create({ key: `fx-${key}`, frames: this.anims.generateFrameNumbers(`fx-${key}`, { start: 0, end: fx.frames - 1 }), frameRate: 18 });
    }
    for (const [key, p] of Object.entries(PROJECTILES)) {
      this.anims.create({ key: `proj-${key}`, frames: this.anims.generateFrameNumbers(`proj-${key}`, { start: 0, end: p.frames - 1 }), frameRate: 14, repeat: -1 });
    }
  }
}
