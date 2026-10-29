import type { AbilityDef } from '../../sim/abilities.ts';

// Canopy: abilities per fighter, mapped from the original tooltips.
export const CANOPY_ABILITIES: Record<string, AbilityDef[]> = {
  // Opens combat with a burst of fast attacks.
  coilstrike: [{ name: 'Coil Frenzy', kind: 'aura', stat: 'attackSpeed', amount: 0.25, radius: 150 }],
  tidecoil: [{ name: 'Coil Frenzy', kind: 'aura', stat: 'attackSpeed', amount: 0.4, radius: 150 }],
  // Slows enemies in 255 range, regen for allies.
  'bramble-patch': [
    { name: 'Tangleroot', kind: 'aura', stat: 'attackSpeed', amount: 0.2, radius: 255, enemies: true },
    { name: 'Fertile Loam', kind: 'aura', stat: 'regen', amount: 3, radius: 255 },
  ],
  stranglevine: [
    { name: 'Choking Vines', kind: 'aura', stat: 'attackSpeed', amount: 0.3, radius: 255, enemies: true },
    { name: 'Fertile Loam', kind: 'aura', stat: 'regen', amount: 3, radius: 255 },
  ],
  // Bouncing attack hitting 2 more enemies (and healing an ally a little).
  fruitflinger: [{ name: 'Peel Ricochet', kind: 'multishot', targets: 2, ratio: 0.6 }],
  'ironback-ape': [
    { name: 'Rind Ricochet', kind: 'multishot', targets: 2, ratio: 0.75 },
    { name: 'Fruit Toss', kind: 'heal', amount: 30, radius: 400, cooldownMs: 3000 },
  ],
  // Leeches up to 15 HP per hit.
  leechmite: [{ name: 'Blood Suck', kind: 'lifesteal', ratio: 0.3 }],
  // Bonus damage against high-HP targets.
  carapax: [{ name: 'Crushing Pincers', kind: 'crit', chance: 0.3, multiplier: 2 }],
  // Wasp swarms harass nearby enemies.
  waspcaller: [{ name: 'Wasp Swarm', kind: 'nova', damage: 25, radius: 300, cooldownMs: 2000 }],
  // Every 18 s roots enemies, 110 damage and -15% attack speed.
  'thorn-oracle': [
    { name: 'Grasping Roots', kind: 'nova', damage: 110, radius: 300, cooldownMs: 18000 },
    { name: 'Root Bind', kind: 'slow', amount: 0.15, durationMs: 2500 },
  ],
  // Escalating extra damage to nearby units.
  shadepelt: [{ name: 'Rend', kind: 'multishot', targets: 2, ratio: 0.5 }],
  blazestripe: [
    { name: 'Savage Rend', kind: 'multishot', targets: 3, ratio: 0.6 },
    { name: 'Lick Wounds', kind: 'aura', stat: 'regen', amount: 3, radius: 150 },
  ],
};
