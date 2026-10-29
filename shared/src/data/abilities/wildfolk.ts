import type { AbilityDef } from '../../sim/abilities.ts';

// Wildfolk: abilities per fighter, mapped from the original tooltips.
const snareToss: AbilityDef = { name: 'Snare Toss', kind: 'slow', amount: 0.4, durationMs: 4000 };

export const WILDFOLK_ABILITIES: Record<string, AbilityDef[]> = {
  mortarsmith: [{ name: 'Shell Burst', kind: 'splash', radius: 80, ratio: 0.35 }],
  'mutagen-brute': [{ name: 'Mutagen Surge', kind: 'aura', stat: 'damage', amount: 0.25, radius: 150 }],
  pitboss: [
    { name: 'Driven Pace', kind: 'aura', stat: 'attackSpeed', amount: 0.15, radius: 150 },
    { name: 'Drill Order', kind: 'aura', stat: 'armor', amount: 3, radius: 150 },
  ],
  netcaster: [snareToss],
  snarechief: [snareToss, { name: 'Pack Frenzy', kind: 'crit', chance: 0.2, multiplier: 1.6 }],
  rootmender: [{ name: 'Rootmend', kind: 'heal', amount: 90, radius: 450, cooldownMs: 4000 }],
  'totem-elder': [
    { name: 'Spirit Mend', kind: 'heal', amount: 150, radius: 450, cooldownMs: 4500 },
    { name: 'Ancestral Ward', kind: 'aura', stat: 'armor', amount: 4, radius: 150 },
  ],
  enthraller: [
    { name: 'Beguile', kind: 'aura', stat: 'damage', amount: 0.15, radius: 200, enemies: true },
    { name: 'Fervor', kind: 'aura', stat: 'attackSpeed', amount: 0.2, radius: 150 },
  ],
  stamphorn: [
    { name: 'Hoof Quake', kind: 'nova', damage: 30, radius: 250, cooldownMs: 6000 },
    { name: 'Tremor Daze', kind: 'slow', amount: 0.1, durationMs: 5000 },
  ],
  quakehide: [
    { name: 'Rift Stomp', kind: 'nova', damage: 80, radius: 325, cooldownMs: 8000 },
    { name: 'Quake Stagger', kind: 'stun', chance: 0.1, durationMs: 1000 },
  ],
};
