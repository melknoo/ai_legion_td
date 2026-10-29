import Phaser from 'phaser';
import type { AttackType, UnitDef } from '@legion/shared';
import type { WeaponKey } from '../assets/manifest.ts';

/** Reach above which an attack counts as ranged (world units). */
export const RANGED = 150;

/** Per-unit animation offsets the scene adds on top of the simulated position. */
export interface Recoil {
  /** Horizontal offset in pixels (lunge forward, recoil back). */
  lunge: number;
  /** Squash factor for sprites without attack frames (1 = none). */
  squash: number;
}

const MELEE_WEAPON: Record<AttackType, WeaponKey> = {
  normal: 'sword', pierce: 'lance', siege: 'hammer', chaos: 'axe', magic: 'wand',
};

export function weaponFor(def: UnitDef): WeaponKey | null {
  if (def.attack.range <= RANGED) return MELEE_WEAPON[def.attack.type];
  if (def.attack.type === 'pierce' || def.attack.type === 'normal') return 'bow';
  if (def.attack.type === 'magic' || def.attack.type === 'chaos') return 'wand';
  return null; // siege engines just fire
}

/** Melee lunges towards the target, ranged attackers recoil; then both settle back. */
export function bodyMotion(scene: Phaser.Scene, r: Recoil, dir: number, ranged: boolean, squash: boolean): void {
  scene.tweens.killTweensOf(r);
  r.lunge = 0;
  r.squash = 1;
  scene.tweens.add({ targets: r, lunge: ranged ? -2 * dir : 4 * dir, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
  if (squash) scene.tweens.add({ targets: r, squash: 0.75, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
}

/** A weapon in the attacker's hand: swung for melee, raised and drawn for ranged. */
export function weaponSwing(scene: Phaser.Scene, key: WeaponKey, x: number, y: number, dir: number): void {
  const w = scene.add.image(Math.round(x + 5 * dir), Math.round(y - 7), `wpn-${key}`).setDepth(y + 1).setFlipX(dir < 0);
  if (key === 'bow') {
    // Bow stands upright with the arc facing the target; the "draw" squeezes it.
    w.setRotation((Math.PI / 2) * dir).setScale(1, 1);
    scene.tweens.add({ targets: w, scaleY: 0.7, duration: 90, yoyo: true, onComplete: () => w.destroy() });
    return;
  }
  if (key === 'wand') {
    w.setOrigin(0.5, 1).setRotation(-0.6 * dir);
    scene.tweens.add({ targets: w, rotation: 0.5 * dir, duration: 110, yoyo: true, onComplete: () => w.destroy() });
    return;
  }
  // Swing from raised-behind to forward-down around the hilt.
  w.setOrigin(0.5, 1).setRotation(-0.9 * dir);
  scene.tweens.add({
    targets: w,
    rotation: 1.9 * dir,
    duration: 140,
    ease: 'Quad.easeIn',
    onComplete: () => scene.tweens.add({ targets: w, alpha: 0, duration: 80, onComplete: () => w.destroy() }),
  });
}

/** Projectile flying from attacker to target; style follows the attack type. */
export function projectile(scene: Phaser.Scene, type: AttackType, x0: number, y0: number, x1: number, y1: number): void {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const duration = Math.max(60, Math.hypot(x1 - x0, y1 - y0) * 4);
  let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  if (type === 'magic' || type === 'chaos' || type === 'siege') {
    obj = scene.add.sprite(x0, y0, `proj-${type}`).play(`proj-${type}`);
    if (type !== 'siege') obj.setBlendMode(Phaser.BlendModes.ADD);
  } else {
    obj = scene.add.image(x0, y0, 'arrow');
  }
  obj.setDepth(10000).setRotation(type === 'siege' ? 0 : angle);
  // Cannonballs arc; everything else flies straight.
  const arc = type === 'siege' ? Math.min(20, Math.abs(x1 - x0) / 4) : 0;
  const path = { t: 0 };
  scene.tweens.add({
    targets: path,
    t: 1,
    duration,
    onUpdate: () => obj.setPosition(x0 + (x1 - x0) * path.t, y0 + (y1 - y0) * path.t - Math.sin(path.t * Math.PI) * arc),
    onComplete: () => obj.destroy(),
  });
}
