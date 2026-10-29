import type { AbilityDef } from '../../sim/abilities.ts';

// Tinker: abilities per fighter, mapped from the original tooltips.
export const TINKER_ABILITIES: Record<string, AbilityDef[]> = {
  // Explodes for 30 / 60 / 80 damage in 200 / 300 / 400 range.
  'pop-mine': [{ name: 'Detonate', kind: 'nova', damage: 30, radius: 200, cooldownMs: 5000 }],
  'blast-mine': [{ name: 'Detonate', kind: 'nova', damage: 60, radius: 300, cooldownMs: 5000 }],
  'megablast-mine': [{ name: 'Detonate', kind: 'nova', damage: 80, radius: 400, cooldownMs: 5000 }],
  // Bullets hit 2 more targets with reduced damage.
  'rivet-turret': [{ name: 'Spray Fire', kind: 'multishot', targets: 2, ratio: 0.5 }],
  'gatling-bot': [{ name: 'Bullet Hail', kind: 'multishot', targets: 2, ratio: 0.5 }],
  // Repairs 40 hp/s for 4 s every 20 s.
  junkplate: [{ name: 'Patch Job', kind: 'aura', stat: 'regen', amount: 8, radius: 150 }],
  // Aura: +8% / +16% ranged damage.
  whirlybird: [{ name: 'Lens Array', kind: 'aura', stat: 'damage', amount: 0.08, radius: 400 }],
  rotorhawk: [{ name: 'Targeting Array', kind: 'aura', stat: 'damage', amount: 0.16, radius: 400 }],
  // Rage: +100% attack rate.
  fizzbruiser: [{ name: 'Fizzy Tonic', kind: 'aura', stat: 'attackSpeed', amount: 0.3, radius: 150 }],
  // +40% attack rate for 18 s every 30 s.
  turbobuster: [{ name: 'Redline Gears', kind: 'aura', stat: 'attackSpeed', amount: 0.25, radius: 150 }],
};
