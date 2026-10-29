import type { AbilityDef } from './abilities.ts';

export type AttackType = 'normal' | 'pierce' | 'siege' | 'magic' | 'chaos';
export type ArmorType = 'unarmored' | 'light' | 'medium' | 'heavy' | 'fortified' | 'hero';
export type TeamId = 0 | 1;
export type UnitKind = 'fighter' | 'creep' | 'merc' | 'king';
export type Phase = 'build' | 'fight' | 'arena' | 'over';
export type KingStat = 'hp' | 'attack' | 'regen';

export type DamageTable = Record<AttackType, Record<ArmorType, number>>;

/** Attacks at or below this reach count as melee (180–200 are big melee units such as giants and lancers). */
export const MELEE_RANGE = 200;

export interface AttackDef {
  /** Inclusive damage roll range before modifiers. */
  damage: [number, number];
  cooldownMs: number;
  /** Edge-to-edge reach in world units (melee ≈ 90). */
  range: number;
  type: AttackType;
}

export interface UnitDef {
  id: string;
  name: string;
  hp: number;
  hpRegen?: number;
  armor: number;
  armorType: ArmorType;
  attack: AttackDef;
  /** World units per second; 0 = stationary. */
  moveSpeed: number;
  radius: number;
  /** Fighters: build cost (base) or upgrade cost (upgrades). */
  goldCost?: number;
  upgradesTo?: string[];
  /** Fighters: 1..6 for base units of a builder. */
  tier?: number;
  /** Morph fighters: building one places a random tier-`morph` fighter of another builder instead. */
  morph?: number;
  /** Boss creeps shrug off crowd control: stuns and slows last a quarter as long. */
  boss?: boolean;
  /** Fighters: food the unit occupies (an upgrade needs only the difference). */
  food?: number;
  abilities?: AbilityDef[];
  /** Gold for the killer's owner when this creep/merc dies. */
  bounty?: number;
}

export interface BuilderDef {
  id: string;
  name: string;
  /** Base fighters (T1..T6) this builder can place. */
  fighters: string[];
  /** Prophet: rolls each player one fighter per tier from all other builders instead. */
  random?: boolean;
}

export interface WaveDef {
  creep: string;
  /** Creeps per lane. */
  count: number;
  /** Gold every player gets when the wave is cleared. */
  levelBonus: number;
  /** Finale: keeps spawning batches until a king dies. */
  endless?: boolean;
}

export interface MercDef {
  id: string;
  unit: string;
  lumberCost: number;
  incomeGain: number;
  /** Wave from which this send can be bought (advanced barracks). */
  minWave?: number;
}

export interface KingRules {
  unit: string;
  upgradeLumber: number;
  upgradeIncome: number;
  /** HP upgrade k (1-based) adds hpBase + hpStep·k. */
  hpBase: number;
  hpStep: number;
  hpMax: number;
  attackStep: number;
  attackMax: number;
  regenStep: number;
  regenMax: number;
  /** Every `buffEvery` waves both kings gain armor and attack speed. */
  buffEvery: number;
  buffArmor: number;
  buffAttackSpeed: number;
  /** Abilities both kings learn after the given waves. */
  grants?: { wave: number; ability: AbilityDef }[];
}

export interface Rules {
  startGold: number;
  startLumber: number;
  startIncome: number;
  startWorkers: number;
  firstBuildMs: number;
  /** Build time before wave n (n ≥ 2): buildBaseMs + ⌊n/2⌋ · buildPerWaveMs. */
  buildBaseMs: number;
  buildPerWaveMs: number;
  /** Safety cap only; the original has no fight time limit. */
  maxFightMs: number;
  spawnIntervalMs: number;
  /** Refund for fighters not built in the current build phase. */
  sellRefund: number;
  creepAggroRange: number;
  creepHpMultiplier: number;
  /** WC3 armor constant (DefenseArmor in gameplay constants). */
  armorFactor: number;
  workerCost: number;
  maxWorkers: number;
  lumberPerWorker: number;
  lumberIntervalMs: number;
  finaleFirstIntervalS: number;
  startFood: number;
  maxFood: number;
  /** Farm upgrades in order; each adds food for gold and lumber. */
  farms: { gold: number; lumber: number; food: number }[];
  /** After these waves both teams' armies fight each other in the arena. */
  arenaWaves: number[];
  /** Arena winners get wave × this gold per player (draws half). */
  arenaGoldPerWave: number;
  arenaMaxMs: number;
  /** Prophet: rerolls of the fighter roster; the n-th costs n × rerollCost gold and lumber. */
  prophet: { rerolls: number; rerollCost: number };
  king: KingRules;
}

export interface GameData {
  units: Record<string, UnitDef>;
  builders: Record<string, BuilderDef>;
  waves: WaveDef[];
  mercs: Record<string, MercDef>;
  damageTable: DamageTable;
  rules: Rules;
}
