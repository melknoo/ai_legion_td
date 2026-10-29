import type { AbilityDef } from '../../sim/abilities.ts';

// Corsair: abilities per fighter, mapped from the original tooltips.
export const CORSAIR_ABILITIES: Record<string, AbilityDef[]> = {
  // Lava tiles around it give regen to units built on them.
  'magma-bosun': [{ name: 'Lava Bed', kind: 'aura', stat: 'regen', amount: 5, radius: 180 }],
  'pyre-commodore': [
    { name: 'Molten Deck', kind: 'aura', stat: 'regen', amount: 12, radius: 180 },
    { name: 'Cinder Slam', kind: 'splash', radius: 110, ratio: 0.15 },
  ],
  // Spawned crew on first contact: extra hits.
  inkspitter: [{ name: 'Ink Volley', kind: 'multishot', targets: 2, ratio: 0.35 }],
  // Stronger crew plus a pulling hook on the priciest enemy.
  'tide-horror': [
    { name: 'Tentacle Lash', kind: 'multishot', targets: 2, ratio: 0.5 },
    { name: 'Undertow Grab', kind: 'stun', chance: 0.15, durationMs: 1000 },
  ],
  // Spit: -2 armor for 6 s and 6 damage per second.
  'rum-swabbie': [
    { name: 'Rum Spray', kind: 'armorBreak', amount: 2, durationMs: 6000 },
    { name: 'Rum Burn', kind: 'poison', dps: 6, durationMs: 6000 },
  ],
  // Hits two targets per swing; foul smell -2 armor to close enemies.
  'cutlass-rogue': [
    { name: 'Twin Cutlass', kind: 'multishot', targets: 1, ratio: 1 },
    { name: 'Foul Breath', kind: 'aura', stat: 'armor', amount: 2, radius: 200, enemies: true },
  ],
  // Shell upgrades: multi-target impact damage and stacking armor reduction.
  'scorch-gunner': [
    { name: 'Shrapnel Shell', kind: 'splash', radius: 120, ratio: 0.4 },
    { name: 'Acid Shell', kind: 'armorBreak', amount: 2, durationMs: 3000 },
  ],
  // Reflects all damage taken.
  squawkbeak: [{ name: 'Mimic Echo', kind: 'thorns', ratio: 1 }],
  // Reflects 40 damage every 1.1 s.
  featherjack: [{ name: 'Sharp Echo', kind: 'thorns', ratio: 0.4 }],
};
