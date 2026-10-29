import type { AbilityDef } from '../../sim/abilities.ts';

// Feral: abilities per fighter, mapped from the original tooltips.
export const FERAL_ABILITIES: Record<string, AbilityDef[]> = {
  jackalkin: [{ name: 'Fever Bite', kind: 'slow', amount: 0.3, durationMs: 4000 }],
  'jackal-venomer': [
    { name: 'Split Quill', kind: 'multishot', targets: 1, ratio: 1 },
    { name: 'Rabid Venom', kind: 'poison', dps: 6, durationMs: 5000 },
  ],
  'tusk-basher': [{ name: 'Skull Thump', kind: 'stun', chance: 0.25, durationMs: 1500 }],
  'tusk-crusher': [{ name: 'Bonecrack', kind: 'stun', chance: 0.35, durationMs: 2000 }],
  barbwing: [
    { name: 'Barbed Sting', kind: 'poison', dps: 3, durationMs: 5000 },
    { name: 'Numbing Barb', kind: 'slow', amount: 0.2, durationMs: 5000 },
  ],
  'venom-matron': [
    { name: 'Coil Venom', kind: 'poison', dps: 11, durationMs: 5000 },
    { name: 'Paralytic Barb', kind: 'slow', amount: 0.3, durationMs: 5000 },
  ],
  junglechief: [{ name: 'War Drums', kind: 'aura', stat: 'attackSpeed', amount: 0.08, radius: 400 }],
  thunderpelt: [
    { name: 'Primal Roar', kind: 'aura', stat: 'damage', amount: 0.2, radius: 150 },
    { name: 'Thick Hide', kind: 'aura', stat: 'armor', amount: 3, radius: 150 },
  ],
  scaleborn: [{ name: 'Tail Sweep', kind: 'splash', radius: 60, ratio: 0.25 }],
  blazewyrm: [
    { name: 'Paleflame', kind: 'splash', radius: 90, ratio: 0.4 },
    { name: 'Scorched Earth', kind: 'nova', damage: 60, radius: 150, cooldownMs: 4500 },
  ],
};
