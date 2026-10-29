import type { AbilityDef } from '../../sim/abilities.ts';

// Spectral: abilities per fighter, mapped from the original tooltips.
export const SPECTRAL_ABILITIES: Record<string, AbilityDef[]> = {
  'hollow-shade': [{ name: 'Unsettle', kind: 'slow', amount: 0.2, durationMs: 7000 }],
  quicksilver: [{ name: 'Dread Chill', kind: 'slow', amount: 0.35, durationMs: 7000 }],
  'spite-shade': [{ name: 'Rend Resolve', kind: 'armorBreak', amount: 4, durationMs: 15000 }],
  'dirge-lantern': [{ name: 'Mute Shriek', kind: 'nova', damage: 30, radius: 250, cooldownMs: 1000 }],
  banelantern: [{ name: 'Bane Chorus', kind: 'nova', damage: 55, radius: 250, cooldownMs: 750 }],
  forsworn: [
    { name: 'Hollow Drain', kind: 'aura', stat: 'armor', amount: 2, radius: 150, enemies: true },
    { name: 'Spiteful Echo', kind: 'thorns', ratio: 0.05 },
  ],
  sorrowmist: [{ name: 'Sorrow Veil', kind: 'aura', stat: 'damage', amount: 0.05, radius: 400, enemies: true }],
  'lament-queen': [{ name: 'Despondence', kind: 'aura', stat: 'damage', amount: 0.1, radius: 400, enemies: true }],
  soulbinder: [
    { name: 'Soul Rot', kind: 'poison', dps: 45, durationMs: 8000 },
    { name: 'Grave Chill', kind: 'slow', amount: 0.25, durationMs: 8000 },
  ],
  eventide: [
    { name: 'Dusk Ruin', kind: 'poison', dps: 90, durationMs: 8000 },
    { name: 'Deep Chill', kind: 'slow', amount: 0.4, durationMs: 8000 },
  ],
};
