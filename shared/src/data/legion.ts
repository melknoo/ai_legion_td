// Game content modelled on Legion TD Mega (3.44 waves/sends, 3.47 fighters and HP fixes).
// Names are our own; numbers follow the original. See docs/mechanics.md.
import type { AbilityDef } from '../sim/abilities.ts';
import type { ArmorType, AttackType, DamageTable, GameData, MercDef, UnitDef, WaveDef } from '../sim/types.ts';
import { FIGHTER_ABILITIES, KING_GRANTS } from './abilities.ts';
import { BUILDERS, FIGHTERS } from './fighters.generated.ts';

export const DAMAGE_TABLE: DamageTable = {
  pierce: { light: 1.3, medium: 0.9, heavy: 0.8, fortified: 0.7, unarmored: 1, hero: 1 },
  normal: { light: 0.9, medium: 1.2, heavy: 0.9, fortified: 0.8, unarmored: 1, hero: 1 },
  magic: { light: 1.1, medium: 0.8, heavy: 1.2, fortified: 0.7, unarmored: 1, hero: 1 },
  siege: { light: 0.9, medium: 0.9, heavy: 0.9, fortified: 1.25, unarmored: 1, hero: 1 },
  chaos: { light: 1, medium: 1, heavy: 1, fortified: 1, unarmored: 1, hero: 1 },
};

const KING: UnitDef = {
  id: 'king',
  name: 'King',
  hp: 2600,
  hpRegen: 3,
  armor: 5,
  armorType: 'hero',
  attack: { damage: [31, 41], cooldownMs: 900, range: 715, type: 'chaos' },
  moveSpeed: 0,
  radius: 48,
};

type Stats = [
  name: string, hp: number, armor: number, armorType: ArmorType, attack: AttackType,
  damage: [number, number], cooldownS: number, range: number, speed: number, bounty: number,
];

function attacker(id: string, [name, hp, armor, armorType, type, damage, cooldownS, range, speed, bounty]: Stats, radius = 22): UnitDef {
  return { id, name, hp, armor, armorType, attack: { damage, cooldownMs: cooldownS * 1000, range, type }, moveSpeed: speed, radius, bounty };
}

// [id, count per lane, level bonus, stats, radius?, endless?]
const WAVES: [string, number, number, Stats, number?, boolean?][] = [
  ['shellback', 36, 11, ['Shellback', 30, 3, 'unarmored', 'pierce', [3, 4], 1.25, 90, 225, 3]],
  ['bog-gobbler', 45, 12, ['Bog Gobbler', 35, 3, 'unarmored', 'normal', [3, 5], 1, 90, 275, 3]],
  ['dune-stinger', 40, 13, ['Dune Stinger', 55, 3, 'medium', 'normal', [6, 8], 1.1, 90, 325, 4]],
  ['spinehog', 36, 14, ['Spinehog', 65, 3, 'heavy', 'pierce', [5, 7], 0.9, 400, 300, 5]],
  ['gale-hawk', 36, 16, ['Gale Hawk', 103, 3, 'light', 'magic', [8, 10], 0.8, 90, 350, 5]],
  ['stone-golem', 36, 18, ['Stone Golem', 116, 3, 'fortified', 'siege', [19, 20], 1.3, 90, 300, 5]],
  ['wild-faun', 30, 20, ['Wild Faun', 185, 3, 'light', 'pierce', [25, 27], 1.2, 100, 375, 6]],
  ['dark-novice', 36, 23, ['Dark Novice', 155, 3, 'medium', 'magic', [13, 17], 1, 400, 300, 6]],
  ['rotwalker', 45, 26, ['Rotwalker', 183, 3, 'heavy', 'normal', [22, 24], 1.1, 120, 280, 5]],
  ['warlord-ignis', 3, 60, ['Warlord Ignis', 3000, 3, 'light', 'chaos', [153, 189], 0.7, 180, 200, 51], 40],
  ['clockwork-imp', 27, 35, ['Clockwork Imp', 350, 3, 'fortified', 'siege', [15, 17], 0.8, 90, 325, 10]],
  ['tide-witch', 45, 40, ['Tide Witch', 210, 3, 'medium', 'pierce', [16, 18], 0.8, 400, 350, 6]],
  ['sky-serpent', 45, 45, ['Sky Serpent', 300, 3, 'light', 'magic', [30, 33], 1, 90, 375, 7]],
  ['walrus-brute', 26, 50, ['Walrus Brute', 640, 3, 'medium', 'normal', [82, 86], 1.2, 90, 350, 12]],
  ['steppe-rider', 36, 55, ['Steppe Rider', 530, 3, 'heavy', 'normal', [74, 84], 1.5, 90, 300, 9]],
  ['ember-newt', 45, 60, ['Ember Newt', 347, 3, 'light', 'magic', [34, 40], 1, 400, 325, 8]],
  ['patchwork-golem', 35, 70, ['Patchwork Golem', 699, 3, 'fortified', 'siege', [80, 84], 1.2, 150, 325, 10]],
  ['muck-slinger', 45, 80, ['Muck Slinger', 780, 3, 'medium', 'magic', [47, 54], 0.9, 120, 350, 8]],
  ['broodmother', 36, 90, ['Broodmother', 998, 3, 'light', 'pierce', [70, 73], 0.8, 150, 350, 10]],
  ['shell-dragon', 3, 200, ['Shell Dragon', 7100, 9, 'heavy', 'chaos', [186, 221], 0.51, 400, 350, 86], 40],
  ['griffin', 36, 110, ['Griffin', 999, 3, 'light', 'pierce', [53, 60], 0.6, 180, 350, 10]],
  ['tusked-mammoth', 48, 120, ['Tusked Mammoth', 960, 3, 'fortified', 'siege', [99, 108], 1.4, 120, 275, 9]],
  ['owlbear', 36, 130, ['Owlbear', 1525, 3, 'heavy', 'normal', [102, 114], 1.1, 120, 300, 11]],
  ['wraith-knight', 35, 140, ['Wraith Knight', 1350, 3, 'medium', 'magic', [89, 99], 1.2, 400, 330, 11]],
  ['night-siren', 45, 150, ['Night Siren', 1650, 3, 'light', 'pierce', [80, 86], 0.7, 150, 420, 9]],
  ['naga-guard', 36, 160, ['Naga Guard', 1960, 3, 'heavy', 'normal', [161, 171], 1.2, 150, 375, 12]],
  ['hell-sentinel', 36, 170, ['Hell Sentinel', 2159, 3, 'medium', 'normal', [121, 129], 0.85, 180, 400, 12]],
  ['iron-juggernaut', 18, 180, ['Iron Juggernaut', 3700, 3, 'fortified', 'siege', [182, 202], 0.9, 400, 325, 23]],
  ['frost-drake', 30, 190, ['Frost Drake', 2732, 3, 'heavy', 'magic', [210, 230], 1.2, 300, 350, 14]],
  ['mountain-titan', 3, 400, ['Mountain Titan', 17055, 16, 'fortified', 'chaos', [736, 802], 0.45, 100, 400, 123], 44],
  ['abyss-lord', 15, 0, ['Abyss Lord', 2670, 20, 'unarmored', 'chaos', [248, 269], 1, 225, 350, 0], 28, true],
];

// [id, lumber cost, income gain, stats (bounty = unit level), unlock wave]
const SENDS: [string, number, number, Stats, number?][] = [
  ['peasant-levy', 20, 1, ['Peasant Levy', 60, 0, 'light', 'normal', [5, 5], 1, 90, 270, 1]],
  ['longbowman', 40, 2, ['Longbowman', 70, 0, 'light', 'pierce', [8, 10], 0.9, 400, 250, 2]],
  ['gravecrawler', 40, 2, ['Gravecrawler', 133, 0, 'medium', 'normal', [10, 14], 1, 90, 385, 2]],
  ['brawler', 60, 2, ['Brawler', 155, 0, 'heavy', 'normal', [21, 23], 1.3, 90, 270, 3]],
  ['drakeling', 120, 6, ['Drakeling', 260, 0, 'light', 'pierce', [37, 43], 1.4, 90, 270, 5]],
  ['hermit', 100, 4, ['Hermit', 230, 0, 'light', 'magic', [25, 27], 1.1, 250, 250, 5]],
  ['raptor', 120, 7, ['Raptor', 220, 0, 'medium', 'pierce', [31, 35], 1, 250, 200, 6]],
  ['commander', 120, 5, ['Commander', 260, 0, 'fortified', 'pierce', [30, 32], 1.2, 300, 250, 6]],
  ['bearkin', 140, 6, ['Bearkin', 390, 0, 'medium', 'normal', [36, 50], 1, 90, 285, 7]],
  ['wyvern-rider', 180, 9, ['Wyvern Rider', 390, 0, 'light', 'pierce', [41, 47], 1, 300, 270, 9]],
  ['war-wagon', 200, 10, ['War Wagon', 260, 0, 'fortified', 'siege', [43, 47], 1.8, 700, 270, 10]],
  ['berserker', 200, 10, ['Berserker', 505, 0, 'heavy', 'normal', [66, 72], 1.2, 90, 475, 10]],
  // Advanced barracks (wave 10+), then the elite stock (wave 15+).
  ['snow-wolf', 240, 11, ['Snow Wolf', 635, 0, 'medium', 'normal', [46, 54], 0.7, 90, 270, 12], 10],
  ['frost-troll', 240, 12, ['Frost Troll', 545, 0, 'medium', 'pierce', [54, 62], 1.2, 275, 250, 12], 10],
  ['hexer', 300, 14, ['Hexer', 585, 0, 'light', 'magic', [59, 67], 1.25, 400, 250, 15], 10],
  ['brewmaster', 300, 15, ['Brewmaster', 775, 0, 'heavy', 'normal', [82, 90], 1, 90, 270, 15], 10],
  ['ballista', 340, 17, ['Ballista', 530, 0, 'medium', 'siege', [88, 98], 1.6, 700, 270, 17], 10],
  ['storm-caller', 400, 18, ['Storm Caller', 770, 0, 'light', 'magic', [65, 73], 0.9, 400, 250, 20], 10],
  ['abomination', 400, 17, ['Abomination', 1050, 0, 'heavy', 'normal', [141, 159], 1.3, 90, 270, 20], 10],
  ['gargoyle', 440, 22, ['Gargoyle', 920, 0, 'light', 'normal', [106, 116], 1, 250, 270, 22], 10],
  ['behemoth', 500, 25, ['Behemoth', 1420, 0, 'fortified', 'siege', [145, 155], 1.3, 90, 270, 25], 15],
  ['kraken', 600, 30, ['Kraken', 1285, 0, 'heavy', 'pierce', [131, 145], 1.2, 400, 270, 30], 15],
  ['inferno-golem', 1000, 50, ['Inferno Golem', 2500, 0, 'fortified', 'chaos', [155, 173], 0.8, 120, 325, 50], 15],
  ['archdemon', 1500, 70, ['Archdemon', 3000, 0, 'unarmored', 'chaos', [221, 257], 0.7, 350, 280, 75], 15],
];

/** Prophet: one random fighter per tier from all other builders, rerollable a few times. */
export const PROPHET = 'prophet';

/** Chimera: six eggs (one per tier) that hatch into a random fighter of another builder. Costs follow the original. */
const MORPH_COSTS: [gold: number, food: number][] = [[18, 1], [45, 1], [85, 1], [135, 1], [200, 2], [305, 2]];
const MORPH_EGGS: UnitDef[] = MORPH_COSTS.map(([goldCost, food], i) => ({
  id: `chimera-egg-${i + 1}`,
  name: `Chimera Egg ${i + 1}`,
  hp: 100,
  armor: 3,
  armorType: 'unarmored',
  attack: { damage: [16, 20], cooldownMs: 900, range: 90, type: 'chaos' },
  moveSpeed: 270,
  radius: 22,
  goldCost,
  food,
  tier: i + 1,
  morph: i + 1,
}));

/** Boss waves 10/20/30: the original's boss marker (crowd-control resistance) plus their spells. */
const BOSSES: Record<string, AbilityDef[]> = {
  'warlord-ignis': [],
  'shell-dragon': [{ name: 'Torrent', kind: 'nova', damage: 120, radius: 250, cooldownMs: 8000 }],
  'mountain-titan': [{ name: 'Shockwave', kind: 'nova', damage: 100, radius: 300, cooldownMs: 7000 }],
};

function buildData(): GameData {
  const units: Record<string, UnitDef> = { king: KING };
  for (const [id, f] of Object.entries(FIGHTERS)) units[id] = FIGHTER_ABILITIES[id] ? { ...f, abilities: FIGHTER_ABILITIES[id] } : f;
  for (const egg of MORPH_EGGS) units[egg.id] = egg;
  const waves: WaveDef[] = WAVES.map(([id, count, levelBonus, stats, radius, endless]) => {
    units[id] = BOSSES[id] ? { ...attacker(id, stats, radius), boss: true, abilities: BOSSES[id] } : attacker(id, stats, radius);
    return { creep: id, count, levelBonus, ...(endless ? { endless } : {}) };
  });
  const mercs: Record<string, MercDef> = {};
  for (const [id, lumberCost, incomeGain, stats, minWave] of SENDS) {
    units[id] = attacker(id, stats);
    mercs[id] = { id, unit: id, lumberCost, incomeGain, ...(minWave ? { minWave } : {}) };
  }
  return {
    units,
    builders: {
      ...BUILDERS,
      chimera: { id: 'chimera', name: 'Chimera', fighters: MORPH_EGGS.map((e) => e.id) },
      [PROPHET]: { id: PROPHET, name: 'Prophet', fighters: [], random: true },
    },
    waves,
    mercs,
    damageTable: DAMAGE_TABLE,
    rules: {
      startGold: 300,
      startLumber: 97,
      startIncome: 0,
      startWorkers: 1,
      firstBuildMs: 80_000,
      buildBaseMs: 40_000,
      buildPerWaveMs: 1_000,
      maxFightMs: 300_000,
      spawnIntervalMs: 100,
      sellRefund: 0.5,
      creepAggroRange: 500,
      creepHpMultiplier: 1.15,
      armorFactor: 0.06,
      workerCost: 50,
      maxWorkers: 7,
      lumberPerWorker: 2,
      lumberIntervalMs: 10_000,
      finaleFirstIntervalS: 60,
      startFood: 15,
      maxFood: 200,
      // Farm levels 1-10, then high elven farm levels 1-6.
      farms: [
        ...Array.from({ length: 10 }, () => ({ gold: 24, lumber: 80, food: 8 })),
        ...Array.from({ length: 6 }, () => ({ gold: 60, lumber: 200, food: 20 })),
      ],
      arenaWaves: [10, 20],
      arenaGoldPerWave: 10,
      arenaMaxMs: 90_000,
      prophet: { rerolls: 7, rerollCost: 40 },
      king: {
        unit: 'king',
        upgradeLumber: 80,
        upgradeIncome: 3,
        hpBase: 425,
        hpStep: 25,
        hpMax: 20,
        attackStep: 10,
        attackMax: 30,
        regenStep: 5,
        regenMax: 20,
        buffEvery: 4,
        buffArmor: 2,
        buffAttackSpeed: 0.1,
        grants: KING_GRANTS,
      },
    },
  };
}

export const LEGION_DATA: GameData = buildData();
