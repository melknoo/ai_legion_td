import Phaser from 'phaser';
import { MELEE_RANGE, type AttackType, type UnitDef } from '@legion/shared';
import type { WeaponKey } from '../assets/manifest.ts';
import type { AttackStyle } from './attackStyle.ts';

/** Per-unit animation offsets the scene adds on top of the simulated position. */
export interface Recoil {
  /** Horizontal offset in pixels (lunge forward, recoil back). */
  lunge: number;
  /** Squash factor for sprites without attack frames (1 = none). */
  squash: number;
  /** Vertical offset in pixels (hop of sprites without attack frames). */
  hop: number;
}

const MELEE_WEAPON: Record<AttackType, WeaponKey> = {
  normal: 'sword', pierce: 'lance', siege: 'hammer', chaos: 'axe', magic: 'wand',
};

export function weaponFor(def: UnitDef): WeaponKey | null {
  if (def.attack.range <= MELEE_RANGE) return MELEE_WEAPON[def.attack.type];
  if (def.attack.type === 'pierce' || def.attack.type === 'normal') return 'bow';
  if (def.attack.type === 'magic' || def.attack.type === 'chaos') return 'wand';
  return null; // siege engines just fire
}

/**
 * Melee rams into the target (fast in, slow back), ranged attackers recoil.
 * Sprites without attack frames (monsters) also hop and squash. Returns the peak lunge in pixels.
 */
export function bodyMotion(scene: Phaser.Scene, r: Recoil, dir: number, ranged: boolean, pounce: boolean): number {
  scene.tweens.killTweensOf(r);
  r.lunge = 0;
  r.squash = 1;
  r.hop = 0;
  const lunge = (ranged ? -2 : 8) * dir;
  scene.tweens.add({
    targets: r,
    lunge,
    duration: ranged ? 70 : 60,
    ease: 'Quad.easeIn',
    onComplete: () => scene.tweens.add({ targets: r, lunge: 0, duration: ranged ? 70 : 160, ease: 'Quad.easeOut' }),
  });
  if (!pounce) return lunge;
  scene.tweens.add({ targets: r, hop: ranged ? -2 : -4, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: r, squash: 0.7, duration: 60, yoyo: true, delay: 60, ease: 'Quad.easeOut' });
  return lunge;
}

interface Swing {
  x: number;
  y: number;
  reach: number;
  from: number;
  now: number;
  dir: number;
  alpha: number;
}

/**
 * The crescents behind swung weapons, all drawn into one Graphics each frame. One Graphics
 * per swing would be a separate draw (and blend switch) for every attacking fighter.
 */
export class SwingTrails {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly swings = new Set<Swing>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  }

  add(swing: Swing): Swing {
    this.swings.add(swing);
    return swing;
  }

  remove(swing: Swing): void {
    this.swings.delete(swing);
  }

  draw(): void {
    const g = this.g;
    g.clear();
    for (const s of this.swings) {
      // Crescent swept by the weapon tip from `from` to `now` (sprite rotations; 0 points up).
      const start = s.from - Math.PI / 2;
      const end = s.now - Math.PI / 2;
      const back = s.dir < 0;
      g.lineStyle(3, 0xffffff, 0.5 * s.alpha).beginPath().arc(s.x, s.y, s.reach - 1, start, end, back).strokePath();
      // A brighter edge on the last stretch, just behind the tip.
      const edge = back ? Math.min(start, end + 1.2) : Math.max(start, end - 1.2);
      g.lineStyle(1, 0xffffff, 0.9 * s.alpha).beginPath().arc(s.x, s.y, s.reach, edge, end, back).strokePath();
    }
  }
}

/** A weapon in the attacker's hand: swung for melee, raised and drawn for ranged. */
export function weaponSwing(scene: Phaser.Scene, trails: SwingTrails, key: WeaponKey, x: number, y: number, dir: number, depth: number): void {
  const w = scene.add.image(Math.round(x + 5 * dir), Math.round(y - 7), `wpn-${key}`).setDepth(depth).setFlipX(dir < 0);
  if (key === 'bow') {
    // Bow stands upright with the arc facing the target; the "draw" squeezes it.
    w.setRotation((Math.PI / 2) * dir).setScale(1, 1);
    scene.tweens.add({ targets: w, scaleY: 0.7, duration: 90, yoyo: true, onComplete: () => w.destroy() });
    return;
  }
  if (key === 'wand') {
    w.setOrigin(0.5, 1).setRotation(-0.6 * dir);
    scene.tweens.add({ targets: w, rotation: 0.5 * dir, duration: 150, yoyo: true, onComplete: () => w.destroy() });
    return;
  }
  // Swing from raised-behind to forward-down around the hilt, hold, then fade; a crescent trails the tip.
  const from = -0.9 * dir;
  const to = 1.9 * dir;
  w.setOrigin(0.5, 1).setRotation(from);
  const trail = trails.add({ x: w.x, y: w.y, reach: w.displayHeight, from, now: from, dir, alpha: 1 });
  scene.tweens.add({
    targets: w,
    rotation: to,
    duration: 250,
    ease: 'Quad.easeIn',
    onUpdate: () => (trail.now = w.rotation),
    onComplete: () => {
      scene.tweens.add({ targets: trail, alpha: 0, duration: 160, onComplete: () => trails.remove(trail) });
      scene.tweens.add({ targets: w, alpha: 0, delay: 120, duration: 100, onComplete: () => w.destroy() });
    },
  });
}

/** Glowing projectiles; solid ones (rock, cannonball, leaves, steel) keep normal blending. */
const GLOW_SHOTS = new Set<string>(['energy', 'fireball', 'icespike']);

/** Projectile flying from attacker to target in the attacker's style; `onHit` runs where it lands. */
export function projectile(scene: Phaser.Scene, style: AttackStyle, x0: number, y0: number, x1: number, y1: number, onHit?: () => void): void {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const duration = Math.max(60, Math.hypot(x1 - x0, y1 - y0) * 4);
  const shot = style.shot ?? 'arrow';
  let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  if (shot === 'arrow' || shot === 'kunai') obj = scene.add.image(x0, y0, shot);
  else {
    obj = scene.add.sprite(x0, y0, `proj-${shot}`).play(`proj-${shot}`);
    if (GLOW_SHOTS.has(shot)) obj.setBlendMode(Phaser.BlendModes.ADD);
  }
  // Glowing shots join the glowing effects one layer up (one batch per blend mode).
  const glow = obj.blendMode === Phaser.BlendModes.ADD;
  if (style.tint !== undefined) obj.setTint(style.tint);
  // Round shots don't point anywhere; shuriken spin by their own frames.
  const round = shot === 'cannon' || shot === 'rock' || shot === 'shuriken';
  obj.setDepth(glow ? 10000.5 : 10000).setRotation(round ? 0 : angle).setFlipX(round && x1 < x0);
  // Cannonballs and rocks arc; everything else flies straight.
  const arc = shot === 'cannon' || shot === 'rock' ? Math.min(20, Math.abs(x1 - x0) / 4) : 0;
  const path = { t: 0 };
  scene.tweens.add({
    targets: path,
    t: 1,
    duration,
    onUpdate: () => obj.setPosition(x0 + (x1 - x0) * path.t, y0 + (y1 - y0) * path.t - Math.sin(path.t * Math.PI) * arc),
    onComplete: () => {
      obj.destroy();
      onHit?.();
    },
  });
}
