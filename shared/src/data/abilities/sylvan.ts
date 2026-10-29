import type { AbilityDef } from '../../sim/abilities.ts';

// Sylvan: abilities per fighter, mapped from the original tooltips.
export const SYLVAN_ABILITIES: Record<string, AbilityDef[]> = {
  // First 5 attacks deal +40 damage.
  'glade-outrider': [{ name: 'Opening Volley', kind: 'crit', chance: 0.15, multiplier: 1.75 }],
  // Bouncing glaives.
  glaivedancer: [{ name: 'Ricochet Glaive', kind: 'multishot', targets: 2, ratio: 0.6 }],
  // Illusion that deals 50% damage.
  twinfeint: [{ name: 'Twin Phantom', kind: 'multishot', targets: 1, ratio: 0.5 }],
  // Lightning that bounces up to 5 times, 100 damage on the first target.
  oakseer: [{ name: 'Thunder Root', kind: 'multishot', targets: 3, ratio: 0.4 }],
  // Armor -6 for 5 s.
  celestine: [{ name: 'Starlight Mark', kind: 'armorBreak', amount: 6, durationMs: 5000 }],
  // Elemental enchantments (no tooltip): one thematic effect per element.
  galeweaver: [{ name: 'Cutting Wind', kind: 'multishot', targets: 1, ratio: 0.4 }],
  rainweaver: [{ name: 'Drench', kind: 'slow', amount: 0.2, durationMs: 2000 }],
  emberweaver: [{ name: 'Searing Touch', kind: 'poison', dps: 15, durationMs: 3000 }],
  stoneweaver: [{ name: 'Rockfall', kind: 'stun', chance: 0.15, durationMs: 1000 }],
  // Flurry of knives, 60 damage each (max 3 targets).
  moonblade: [{ name: 'Crescent Flurry', kind: 'nova', damage: 60, radius: 250, cooldownMs: 6000 }],
  // Every 6 s strikes 3 enemies + knife flurry, heals 33 hp per unit hit.
  shadowmoon: [
    { name: 'Eclipse Flurry', kind: 'nova', damage: 100, radius: 300, cooldownMs: 6000 },
    { name: 'Lunar Siphon', kind: 'lifesteal', ratio: 0.1 },
  ],
};
