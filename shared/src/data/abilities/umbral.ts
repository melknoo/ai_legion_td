import type { AbilityDef } from '../../sim/abilities.ts';

// Umbral: abilities per fighter, mapped from the original tooltips.
const duskVigor = (amount: number): AbilityDef => ({ name: 'Dusk Vigor', kind: 'aura', stat: 'regen', amount, radius: 150 });

export const UMBRAL_ABILITIES: Record<string, AbilityDef[]> = {
  duskling: [duskVigor(1)],
  duskblade: [
    { name: 'Grim Cadence', kind: 'aura', stat: 'attackSpeed', amount: 0.1, radius: 300 },
    { name: 'Reaping Spree', kind: 'crit', chance: 0.25, multiplier: 1.5 },
  ],
  emberbow: [{ name: 'Cinder Shaft', kind: 'crit', chance: 0.25, multiplier: 2.5 }, duskVigor(2)],
  gloomcaster: [{ name: 'Hasten Shadows', kind: 'aura', stat: 'attackSpeed', amount: 0.15, radius: 350 }, duskVigor(2)],
  webstalker: [
    { name: 'Clinging Silk', kind: 'slow', amount: 0.15, durationMs: 5000 },
    { name: 'Silk Venom', kind: 'poison', dps: 5, durationMs: 5000 },
  ],
  'rift-sentry': [{ name: 'Void Bolt', kind: 'crit', chance: 0.1, multiplier: 3.5 }],
  'rift-herald': [{ name: 'Void Lance', kind: 'crit', chance: 0.1, multiplier: 4 }],
  'dread-eye': [{ name: 'Blood Pact', kind: 'aura', stat: 'regen', amount: 4, radius: 350 }],
  soulgazer: [{ name: 'Crimson Pact', kind: 'aura', stat: 'regen', amount: 8, radius: 400 }],
  gloomstalker: [{ name: 'Shadow Strike', kind: 'crit', chance: 0.1, multiplier: 2 }],
  mirrorshade: [{ name: 'Mirror Strike', kind: 'crit', chance: 0.1, multiplier: 3 }],
};
