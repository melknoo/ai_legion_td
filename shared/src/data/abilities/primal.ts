import type { AbilityDef } from '../../sim/abilities.ts';

// Primal: abilities per fighter, mapped from the original tooltips.
export const PRIMAL_ABILITIES: Record<string, AbilityDef[]> = {
  tidewisp: [{ name: 'Ripple', kind: 'multishot', targets: 1, ratio: 0.8 }],
  deepswell: [{ name: 'Undertow', kind: 'multishot', targets: 2, ratio: 0.8 }],
  breezeling: [{ name: 'Gust', kind: 'nova', damage: 3, radius: 300, cooldownMs: 1000 }],
  windshear: [{ name: 'Shear Gale', kind: 'nova', damage: 20, radius: 300, cooldownMs: 1000 }],
  claybrute: [{ name: 'Mire Grip', kind: 'stun', chance: 0.05, durationMs: 1250 }],
  boulderback: [
    { name: 'Rockslide', kind: 'stun', chance: 0.12, durationMs: 1500 },
    { name: 'Rock Hide', kind: 'aura', stat: 'armor', amount: 3, radius: 150 },
  ],
  runesage: [{ name: 'Arcane Burst', kind: 'splash', radius: 150, ratio: 0.6 }],
  'astral-sage': [{ name: 'Starflare', kind: 'crit', chance: 0.35, multiplier: 1.65 }],
  'cinder-sibyl': [{ name: 'Ember Ward', kind: 'aura', stat: 'armor', amount: 3, radius: 150 }],
  'ashborn-roc': [{ name: 'Kindling Haste', kind: 'aura', stat: 'attackSpeed', amount: 0.25, radius: 150 }],
};
