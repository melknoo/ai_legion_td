import type { AbilityDef } from '../../sim/abilities.ts';

// Frost: abilities per fighter, mapped from the original tooltips.
export const FROST_ABILITIES: Record<string, AbilityDef[]> = {
  // +12 cold damage, slows movement 60%.
  'floe-harpooner': [{ name: 'Harpoon Chill', kind: 'slow', amount: 0.3, durationMs: 2000 }],
  // Attacked units shatter on death: 3 damage to 4 units.
  'rime-hound': [{ name: 'Shatter', kind: 'splash', radius: 100, ratio: 0.15 }],
  // Same with 8 damage.
  snowpaw: [{ name: 'Shatterfrost', kind: 'splash', radius: 100, ratio: 0.15 }],
  // Aura: allies return 4% of melee damage.
  chillcaster: [{ name: 'Icicle Ward', kind: 'thorns', ratio: 0.1 }],
  // Slows attack 15% / move 50%; aura returns 8% of melee damage.
  rimeseer: [
    { name: 'Numbing Touch', kind: 'slow', amount: 0.25, durationMs: 2000 },
    { name: 'Icicle Ward', kind: 'thorns', ratio: 0.15 },
  ],
  // Slow aura 40%; 25% chance for 25 bonus damage + 1 s stun.
  icepelt: [
    { name: 'Maul', kind: 'stun', chance: 0.25, durationMs: 1000 },
    { name: 'Numbing Cold', kind: 'aura', stat: 'attackSpeed', amount: 0.1, radius: 300, enemies: true },
  ],
  // Slow aura 60%.
  hailhorn: [{ name: 'Deep Freeze', kind: 'aura', stat: 'attackSpeed', amount: 0.15, radius: 350, enemies: true }],
  // Every 5 attacks: +120% attack speed for 5 attacks, each heals 8% of missing life.
  snowstalker: [
    { name: 'Avalanche Fury', kind: 'crit', chance: 0.25, multiplier: 1.6 },
    { name: 'Gnaw', kind: 'lifesteal', ratio: 0.1 },
  ],
  'blizzard-fiend': [
    { name: 'Avalanche Fury', kind: 'crit', chance: 0.25, multiplier: 1.6 },
    { name: 'Gnaw', kind: 'lifesteal', ratio: 0.12 },
  ],
  // Cone of frost: 11 damage + 5 dps for 6 s.
  'icewing-whelp': [
    { name: 'Rime Breath', kind: 'splash', radius: 110, ratio: 0.25 },
    { name: 'Frost Burn', kind: 'poison', dps: 5, durationMs: 6000 },
  ],
  // Small splash; +3 armor and slows attackers.
  sleetwing: [
    { name: 'Rime Breath', kind: 'splash', radius: 110, ratio: 0.3 },
    { name: 'Hoarfrost Plating', kind: 'aura', stat: 'armor', amount: 3, radius: 150 },
  ],
};
