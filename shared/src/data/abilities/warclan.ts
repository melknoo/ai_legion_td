import type { AbilityDef } from '../../sim/abilities.ts';

// Warclan: abilities per fighter, mapped from the original tooltips.
export const WARCLAN_ABILITIES: Record<string, AbilityDef[]> = {
  // Self buff: +30% attack rate (drains hp).
  bloodfang: [{ name: 'Blood Fury', kind: 'aura', stat: 'attackSpeed', amount: 0.3, radius: 150 }],
  // Growing chance to finish a target in one blow; faster attacks at low hp.
  ripclaw: [
    { name: 'Gutting Strike', kind: 'crit', chance: 0.06, multiplier: 4 },
    { name: 'Wounded Fury', kind: 'aura', stat: 'attackSpeed', amount: 0.2, radius: 150 },
  ],
  // Target deals 10% less damage for 5 s.
  ashcaller: [{ name: 'Withering Hex', kind: 'slow', amount: 0.1, durationMs: 5000 }],
  // Armor -4 for 4 s.
  cinderhex: [{ name: 'Ash Brand', kind: 'armorBreak', amount: 4, durationMs: 4000 }],
  // Aura: +5 / +10 life regeneration.
  'mojo-mender': [{ name: 'Mojo Ward', kind: 'aura', stat: 'regen', amount: 5, radius: 400 }],
  totemwise: [{ name: 'Ancestral Mojo', kind: 'aura', stat: 'regen', amount: 10, radius: 400 }],
  // 15 poison dps for 4 s.
  venomwing: [{ name: 'Venom Barb', kind: 'poison', dps: 15, durationMs: 4000 }],
  // 22% chance to deal 30 damage to nearby units.
  skullsplitter: [{ name: 'Ground Splitter', kind: 'nova', damage: 30, radius: 200, cooldownMs: 6000 }],
  // Hammer throw: 300 damage + 3 s stun; summons a burning volcano spawn.
  'ashstorm-khan': [
    { name: 'Thunder Maul', kind: 'stun', chance: 0.15, durationMs: 2000 },
    { name: 'Magma Rift', kind: 'nova', damage: 40, radius: 250, cooldownMs: 3000 },
  ],
};
