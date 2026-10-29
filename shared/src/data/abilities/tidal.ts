import type { AbilityDef } from '../../sim/abilities.ts';

// Tidal: abilities per fighter, mapped from the original tooltips.
export const TIDAL_ABILITIES: Record<string, AbilityDef[]> = {
  // Regains 50 hp every 5 attacks.
  gnashjaw: [{ name: 'Gulp Down', kind: 'lifesteal', ratio: 0.2 }],
  // +6 pure damage per attack.
  venomgill: [{ name: 'Bile Skin', kind: 'poison', dps: 6, durationMs: 3000 }],
  // Water shield on an ally: +5 armor.
  wavesinger: [{ name: 'Water Veil', kind: 'aura', stat: 'armor', amount: 2, radius: 350 }],
  // Water shield + geyser healing nearby allies 10 hp/s.
  'coral-queen': [
    { name: 'Water Veil', kind: 'aura', stat: 'armor', amount: 3, radius: 400 },
    { name: 'Geyser Mist', kind: 'aura', stat: 'regen', amount: 6, radius: 400 },
  ],
  // Dives, then +25% attack for 5 s.
  'shoal-lurker': [{ name: 'Ambush Surge', kind: 'crit', chance: 0.15, multiplier: 1.5 }],
  // 20% double damage + 2 s stun; wave for 65 damage every 14 s.
  wavebreaker: [
    { name: 'Riptide Slam', kind: 'stun', chance: 0.2, durationMs: 2000 },
    { name: 'Breaker Wave', kind: 'nova', damage: 65, radius: 500, cooldownMs: 14000 },
  ],
  // Every 3rd attack hits up to 3 units for 80%.
  'kelp-horror': [{ name: 'Lashing Tendrils', kind: 'multishot', targets: 2, ratio: 0.3 }],
};
