// Abilities per fighter. Effects mirror what the original Legion TD Mega abilities do
// (aura, splash, heal, ...); names are our own and numbers are first-pass balance values.
import type { AbilityDef } from '../sim/abilities.ts';
import { ABYSS_ABILITIES } from './abilities/abyss.ts';
import { CANOPY_ABILITIES } from './abilities/canopy.ts';
import { CORSAIR_ABILITIES } from './abilities/corsair.ts';
import { FERAL_ABILITIES } from './abilities/feral.ts';
import { FORGE_ABILITIES } from './abilities/forge.ts';
import { FROST_ABILITIES } from './abilities/frost.ts';
import { PRIMAL_ABILITIES } from './abilities/primal.ts';
import { SPECTRAL_ABILITIES } from './abilities/spectral.ts';
import { SYLVAN_ABILITIES } from './abilities/sylvan.ts';
import { TIDAL_ABILITIES } from './abilities/tidal.ts';
import { TINKER_ABILITIES } from './abilities/tinker.ts';
import { UMBRAL_ABILITIES } from './abilities/umbral.ts';
import { WARCLAN_ABILITIES } from './abilities/warclan.ts';
import { WILDFOLK_ABILITIES } from './abilities/wildfolk.ts';

const thorns = (name: string, ratio: number): AbilityDef => ({ name, kind: 'thorns', ratio });
const splash = (name: string, radius: number, ratio: number): AbilityDef => ({ name, kind: 'splash', radius, ratio });
const crit = (name: string, chance: number, multiplier: number): AbilityDef => ({ name, kind: 'crit', chance, multiplier });
const heal = (name: string, amount: number, radius: number, cooldownMs: number): AbilityDef => ({ name, kind: 'heal', amount, radius, cooldownMs });
const poison = (name: string, dps: number, durationMs: number): AbilityDef => ({ name, kind: 'poison', dps, durationMs });

const CORE_ABILITIES: Record<string, AbilityDef[]> = {
  // Clockwork
  gearknight: [thorns('Spiked Plating', 0.2)],
  voltgunner: [{ name: 'Chain Spark', kind: 'multishot', targets: 2, ratio: 0.5 }],
  flamer: [splash('Flame Spray', 80, 0.3)],
  'brass-captain': [{ name: 'Rally Cry', kind: 'aura', stat: 'damage', amount: 0.1, radius: 400 }],
  'iron-admiral': [{ name: 'Iron Discipline', kind: 'aura', stat: 'armor', amount: 3, radius: 400 }],
  'dread-engine': [splash('Shockwave Shells', 120, 0.5)],
  colossus: [crit('Overdrive', 0.2, 2)],
  'doom-engine': [splash('Doom Barrage', 140, 0.6)],

  // Grove
  oakwarden: [{ name: 'Root Snare', kind: 'stun', chance: 0.15, durationMs: 1500 }],
  pathfinder: [crit('Keen Eye', 0.15, 1.75)],
  dryad: [{ name: 'Mark Prey', kind: 'armorBreak', amount: 2, durationMs: 4000 }, crit('Precision', 0.2, 2)],
  pixie: [{ name: 'Faerie Dust', kind: 'slow', amount: 0.2, durationMs: 2000 }],
  stormbird: [splash('Aftershock', 100, 0.4)],
  wanderwood: [heal('Sap Mend', 60, 350, 6000)],
  timberkeeper: [{ name: 'Timewarp', kind: 'aura', stat: 'attackSpeed', amount: 0.15, radius: 350 }],
  'mountain-giant': [{ name: 'Stone Skin', kind: 'aura', stat: 'armor', amount: 2, radius: 300 }, thorns('Bark Spikes', 0.15)],
  'seed-of-ages': [{ name: 'Blessed Soil', kind: 'aura', stat: 'regen', amount: 3, radius: 400 }],
  lifebloom: [heal('Bloom', 150, 400, 5000), { name: 'Blessed Soil', kind: 'aura', stat: 'regen', amount: 5, radius: 400 }],
  'wisdom-oak': [{ name: 'Ancient Wisdom', kind: 'aura', stat: 'damage', amount: 0.15, radius: 400 }],

  // Crypt
  ravager: [{ name: 'Feast', kind: 'lifesteal', ratio: 0.25 }],
  'bone-cart': [splash('Bone Shrapnel', 100, 0.5)],
  'bone-catapult': [splash('Bone Shrapnel', 120, 0.5)],
  bonecaller: [poison('Grave Rot', 8, 4000)],
  deathspeaker: [poison('Grave Rot', 15, 4000)],
  banshee: [{ name: 'Wail', kind: 'aura', stat: 'armor', amount: 2, radius: 350, enemies: true }],
  'rotting-hulk': [poison('Contagion', 10, 5000)],
  butcher: [{ name: 'Feast', kind: 'lifesteal', ratio: 0.2 }, { name: 'Plague Cloud', kind: 'nova', damage: 80, radius: 160, cooldownMs: 6000 }],
  'grave-warden': [splash('Cleave', 120, 0.35)],
  'bone-wyrm': [splash('Frost Breath', 140, 0.5), { name: 'Frostbite', kind: 'slow', amount: 0.25, durationMs: 2000 }],

  // Order
  militiaman: [crit('Veteran Strike', 0.1, 2)],
  marksman: [{ name: 'Volley', kind: 'multishot', targets: 2, ratio: 0.8 }],
  bulwark: [{ name: 'Shield Wall', kind: 'aura', stat: 'armor', amount: 2, radius: 300 }],
  lightcaller: [heal('Heal', 40, 400, 4000)],
  lightbringer: [heal('Greater Heal', 120, 450, 4000)],
  'paladin-lord': [thorns('Retribution', 0.3)],
  'gryphon-knight': [{ name: 'Storm Hammer', kind: 'stun', chance: 0.2, durationMs: 1000 }],
};

/** Every builder's fighter abilities; the later builders live in ./abilities/. */
export const FIGHTER_ABILITIES: Record<string, AbilityDef[]> = {
  ...CORE_ABILITIES,
  ...ABYSS_ABILITIES,
  ...CANOPY_ABILITIES,
  ...CORSAIR_ABILITIES,
  ...FERAL_ABILITIES,
  ...FORGE_ABILITIES,
  ...FROST_ABILITIES,
  ...PRIMAL_ABILITIES,
  ...SPECTRAL_ABILITIES,
  ...SYLVAN_ABILITIES,
  ...TIDAL_ABILITIES,
  ...TINKER_ABILITIES,
  ...UMBRAL_ABILITIES,
  ...WARCLAN_ABILITIES,
  ...WILDFOLK_ABILITIES,
};

/** What both kings learn as the game goes on (waves 4, 13, 19, 23 in the original). */
export const KING_GRANTS: { wave: number; ability: AbilityDef }[] = [
  { wave: 4, ability: { name: 'Royal Stomp', kind: 'nova', damage: 45, radius: 350, cooldownMs: 9000 } },
  { wave: 13, ability: { name: 'Command Aura', kind: 'aura', stat: 'damage', amount: 0.15, radius: 800 } },
  { wave: 19, ability: { name: 'Devotion Aura', kind: 'aura', stat: 'armor', amount: 5, radius: 800 } },
  { wave: 23, ability: { name: 'Endurance Aura', kind: 'aura', stat: 'attackSpeed', amount: 0.1, radius: 800 } },
];
