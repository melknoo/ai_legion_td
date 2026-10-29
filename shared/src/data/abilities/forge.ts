import type { AbilityDef } from '../../sim/abilities.ts';

// Forge: abilities per fighter, mapped from the original tooltips.
export const FORGE_ABILITIES: Record<string, AbilityDef[]> = {
  // Frontal damage reduction: armor on itself.
  anvilguard: [{ name: 'Shield Brace', kind: 'aura', stat: 'armor', amount: 3, radius: 150 }],
  // Same, plus +1 armor per leader on the field (stacks).
  'clan-reaver': [
    { name: 'Shield Brace', kind: 'aura', stat: 'armor', amount: 4, radius: 150 },
    { name: 'War March', kind: 'aura', stat: 'armor', amount: 1, radius: 400 },
  ],
  // 2.25x critical strikes.
  cragshot: [{ name: 'Hawk Sight', kind: 'crit', chance: 0.1, multiplier: 2.25 }],
  'highpeak-ace': [{ name: 'Dead Aim', kind: 'crit', chance: 0.15, multiplier: 2.25 }],
  // Builds a temporary turret: extra hits.
  'bolt-tinker': [{ name: 'Field Turret', kind: 'multishot', targets: 1, ratio: 0.5 }],
  // Gatling gun plus buffing the strongest nearby ally.
  hearthsmith: [
    { name: 'Gatling Nest', kind: 'multishot', targets: 2, ratio: 0.4 },
    { name: 'Forge Blessing', kind: 'aura', stat: 'damage', amount: 0.1, radius: 300 },
  ],
  // Gains 10 HP per attack.
  'stone-ascetic': [{ name: 'Anointed Fist', kind: 'lifesteal', ratio: 0.12 }],
  // More damage at low HP.
  ironrage: [{ name: 'Blood Fury', kind: 'crit', chance: 0.2, multiplier: 2 }],
  // Every 3 s an extra 220 lightning damage on attack.
  'thunder-thane': [{ name: 'Thunder Oath', kind: 'crit', chance: 0.33, multiplier: 3 }],
  // Every 22 s a storm of 6 x 220 lightning in 500 range.
  'tempest-thane': [{ name: 'Skyhammer Storm', kind: 'nova', damage: 220, radius: 400, cooldownMs: 22000 }],
};
