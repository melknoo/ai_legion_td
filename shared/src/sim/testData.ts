import type { ArmorType, AttackType, DamageTable, GameData, UnitDef } from './types.ts';

const ATTACKS: AttackType[] = ['normal', 'pierce', 'siege', 'magic', 'chaos'];
const ARMORS: ArmorType[] = ['unarmored', 'light', 'medium', 'heavy', 'fortified', 'hero'];

export const FLAT_DAMAGE: DamageTable = Object.fromEntries(
  ATTACKS.map((a) => [a, Object.fromEntries(ARMORS.map((r) => [r, 1]))]),
) as DamageTable;

const unit = (u: UnitDef): UnitDef => u;

/** Small fixed content for simulation tests; not game balance. */
export function testData(overrides: Partial<GameData> = {}): GameData {
  return {
    units: {
      sprout: unit({
        id: 'sprout', name: 'Sprout', hp: 150, armor: 2, armorType: 'medium', moveSpeed: 270, radius: 16, goldCost: 25,
        attack: { damage: [15, 18], cooldownMs: 1200, range: 90, type: 'normal' }, upgradesTo: ['oak'],
      }),
      oak: unit({
        id: 'oak', name: 'Oak', hp: 700, armor: 3, armorType: 'heavy', moveSpeed: 270, radius: 20, goldCost: 125,
        attack: { damage: [80, 90], cooldownMs: 1200, range: 90, type: 'normal' },
      }),
      archer: unit({
        id: 'archer', name: 'Archer', hp: 120, armor: 0, armorType: 'light', moveSpeed: 270, radius: 16, goldCost: 60,
        attack: { damage: [20, 24], cooldownMs: 1000, range: 500, type: 'pierce' },
      }),
      grub: unit({
        id: 'grub', name: 'Grub', hp: 60, armor: 0, armorType: 'light', moveSpeed: 220, radius: 16, bounty: 3,
        attack: { damage: [5, 7], cooldownMs: 1000, range: 90, type: 'normal' },
      }),
      brute: unit({
        id: 'brute', name: 'Brute', hp: 300, armor: 1, armorType: 'medium', moveSpeed: 240, radius: 20, bounty: 6,
        attack: { damage: [12, 14], cooldownMs: 1000, range: 90, type: 'normal' },
      }),
      king: unit({
        id: 'king', name: 'King', hp: 5000, hpRegen: 5, armor: 5, armorType: 'heavy', moveSpeed: 0, radius: 48,
        attack: { damage: [100, 120], cooldownMs: 1000, range: 150, type: 'chaos' },
      }),
    },
    builders: { grove: { id: 'grove', name: 'Grove', fighters: ['sprout', 'archer'] } },
    waves: [
      { creep: 'grub', count: 6, levelBonus: 11 },
      { creep: 'grub', count: 10, levelBonus: 12 },
    ],
    mercs: { brute: { id: 'brute', unit: 'brute', lumberCost: 20, incomeGain: 2 } },
    damageTable: FLAT_DAMAGE,
    rules: {
      startGold: 250,
      startLumber: 50,
      startIncome: 10,
      startWorkers: 1,
      firstBuildMs: 5000,
      buildBaseMs: 3000,
      buildPerWaveMs: 0,
      maxFightMs: 120000,
      spawnIntervalMs: 100,
      sellRefund: 0.5,
      creepAggroRange: 500,
      creepHpMultiplier: 1,
      armorFactor: 0.06,
      workerCost: 50,
      maxWorkers: 3,
      lumberPerWorker: 2,
      lumberIntervalMs: 10000,
      finaleFirstIntervalS: 60,
      startFood: 100,
      maxFood: 200,
      farms: [{ gold: 10, lumber: 10, food: 8 }],
      arenaWaves: [],
      arenaGoldPerWave: 10,
      arenaMaxMs: 60000,
      king: {
        unit: 'king', upgradeLumber: 20, upgradeIncome: 3, hpBase: 425, hpStep: 25, hpMax: 2,
        attackStep: 10, attackMax: 30, regenStep: 5, regenMax: 20, buffEvery: 1, buffArmor: 2, buffAttackSpeed: 0.1,
      },
    },
    ...overrides,
  };
}
