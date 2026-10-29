import type { AbilityDef } from '../../sim/abilities.ts';

// Abyss: abilities per fighter, mapped from the original tooltips.
export const ABYSS_ABILITIES: Record<string, AbilityDef[]> = {
  // Self-infection: small attack speed boost.
  mawgrub: [{ name: 'Host Frenzy', kind: 'aura', stat: 'attackSpeed', amount: 0.04, radius: 150 }],
  // Root strike every 5 s near itself, healing itself.
  gnarlrot: [
    { name: 'Rot Lash', kind: 'nova', damage: 70, radius: 180, cooldownMs: 5000 },
    { name: 'Sap Drain', kind: 'lifesteal', ratio: 0.08 },
  ],
  // Periodic falloff AoE around the main target.
  ruinwing: [{ name: 'Ruin Breath', kind: 'splash', radius: 150, ratio: 0.4 }],
  // Steals 10% attack speed per proc (debuff 5 s, stacking self buff).
  hourthief: [
    { name: 'Hour Siphon', kind: 'slow', amount: 0.1, durationMs: 5000 },
    { name: 'Borrowed Time', kind: 'aura', stat: 'attackSpeed', amount: 0.2, radius: 150 },
  ],
  // Slows enemies around it by 20% and hastes itself.
  chronophage: [
    { name: 'Stillness Field', kind: 'aura', stat: 'attackSpeed', amount: 0.2, radius: 300, enemies: true },
    { name: 'Quickened Hour', kind: 'aura', stat: 'attackSpeed', amount: 0.15, radius: 150 },
  ],
  // Two summoned helpers: extra hits on nearby enemies.
  'dusk-envoy': [{ name: 'Shade Envoys', kind: 'multishot', targets: 2, ratio: 0.5 }],
  // Three summoned helpers, then a portal blast lowering enemy damage by 18%.
  nullshade: [
    { name: 'Void Brood', kind: 'multishot', targets: 3, ratio: 0.4 },
    { name: 'Dread Veil', kind: 'aura', stat: 'damage', amount: 0.12, radius: 450, enemies: true },
  ],
};
