// Maps simulation unit ids to sprites from the Ninja Adventure pack (CC0, Pixel-boy & AAA).
// Hue shifts give palette variants of one base sprite, FF6-style.
import { FIGHTER_SPRITES, MONSTER_FILES } from './sprites.generated.ts';

const BASE = 'assets/ninja';

export type SpriteSpec =
  | { kind: 'character'; folder: string; hue?: number; scale?: number }
  | { kind: 'monster'; folder: string; hue?: number; scale?: number };

const m = (folder: string, extra: { hue?: number; scale?: number } = {}): SpriteSpec => ({ kind: 'monster', folder, ...extra });
const c = (folder: string, extra: { hue?: number; scale?: number } = {}): SpriteSpec => ({ kind: 'character', folder, ...extra });

const CREEP_SPRITES: Record<string, SpriteSpec> = {
  shellback: m('Mollusc'),
  'bog-gobbler': m('KappaGreen'),
  'dune-stinger': m('SpiderYellow'),
  spinehog: m('Beast'),
  'gale-hawk': m('YellowsBat'),
  'stone-golem': m('Cyclope2'),
  'wild-faun': m('Racoon'),
  'dark-novice': m('Eye'),
  rotwalker: m('Slime3'),
  'warlord-ignis': m('Flam2', { scale: 2 }),
  'clockwork-imp': m('Mole'),
  'tide-witch': m('Octopus'),
  'sky-serpent': m('Snake3'),
  'walrus-brute': m('Bear'),
  'steppe-rider': m('Lizard'),
  'ember-newt': m('Axolot'),
  'patchwork-golem': m('Cyclope'),
  'muck-slinger': m('Slime4'),
  broodmother: m('SpiderRed'),
  'shell-dragon': m('Dragon', { scale: 2 }),
  griffin: m('Owl'),
  'tusked-mammoth': m('Panda'),
  owlbear: m('Owl2'),
  'wraith-knight': m('Spirit2'),
  'night-siren': m('ButterflyBlue'),
  'naga-guard': m('Reptile'),
  'hell-sentinel': m('Beast2'),
  'iron-juggernaut': m('Grey Trex'),
  'frost-drake': m('DragonYellow', { hue: 180 }),
  'mountain-titan': m('TRex', { scale: 2 }),
  'abyss-lord': m('Spirit', { hue: 270, scale: 1.5 }),
};

const SEND_SPRITES: Record<string, SpriteSpec> = {
  'peasant-levy': c('Villager3'),
  longbowman: c('Hunter', { hue: 300 }),
  gravecrawler: c('Skeleton', { hue: 90 }),
  brawler: c('FighterRed'),
  drakeling: m('Dragon'),
  hermit: c('OldMan'),
  raptor: m('TRex', { hue: 60 }),
  commander: c('SamuraiRed'),
  bearkin: m('Bear', { hue: 30 }),
  'wyvern-rider': m('Dragon', { hue: 120 }),
  'war-wagon': c('RobotCamouflage', { hue: 30 }),
  berserker: c('RedGladiator'),
  'snow-wolf': m('Beast', { hue: 180 }),
  'frost-troll': c('Eskimo'),
  hexer: c('SorcererOrange'),
  brewmaster: m('Panda', { hue: 30 }),
  ballista: c('RobotGrey', { hue: 40 }),
  'storm-caller': c('Shaman', { hue: 200 }),
  abomination: c('DemonGreen', { hue: 60 }),
  gargoyle: m('Grey Trex', { hue: 260 }),
  behemoth: m('Bear', { scale: 1.5 }),
  kraken: m('Octopus2', { scale: 1.5 }),
  'inferno-golem': m('Flam', { scale: 1.5 }),
  archdemon: c('DemonRed', { scale: 1.5 }),
};

/** Chimera eggs, tinted per tier. */
const EGG_SPRITES: Record<string, SpriteSpec> = Object.fromEntries(
  [0, 40, 100, 180, 260, 320].map((hue, i) => [`chimera-egg-${i + 1}`, c(i % 2 ? 'EggGirl' : 'EggBoy', hue ? { hue } : {})]),
);

export const UNIT_SPRITES: Record<string, SpriteSpec> = { ...FIGHTER_SPRITES, ...CREEP_SPRITES, ...SEND_SPRITES, ...EGG_SPRITES };

/** Hand-picked portrait units for builders in menus; others show their tier-6 fighter. */
const BUILDER_PORTRAIT: Record<string, string> = {
  clockwork: 'gearknight',
  grove: 'seed-of-ages',
  crypt: 'bonecaller',
  order: 'lancer',
  chimera: 'chimera-egg-6',
};

export function builderPortrait(builder: { id: string; fighters: string[] }): string {
  return BUILDER_PORTRAIT[builder.id] ?? builder.fighters[builder.fighters.length - 1] ?? '';
}

/** Creeps marching across the title screen. */
export const TITLE_PARADE = ['shellback', 'dune-stinger', 'gale-hawk', 'stone-golem', 'rotwalker', 'sky-serpent', 'broodmother'];

export const KING_SPRITES = ['GiantBlueSamurai', 'GiantRedSamurai'] as const;

// Sheet columns are facing directions: down, up, left, right.
export const DIR = { down: 0, up: 1, left: 2, right: 3 } as const;

/** Effect strips: frame width/height and frame count. */
const fx = (file: string, w: number, h: number, frames: number) => ({ path: `${BASE}/FX/${file}`, w, h, frames });
export const FX = {
  smoke: fx('Smoke/Smoke/SpriteSheet.png', 32, 32, 6),
  cut: fx('Attack/Cut/SpriteSheet.png', 32, 32, 4),
  cutx: fx('Attack/CutX/SpriteSheet.png', 32, 32, 4),
  slash: fx('Attack/CircularSlash/SpriteSheet.png', 32, 32, 4),
  explosion: fx('Elemental/Explosion/SpriteSheet.png', 40, 40, 9),
  spark: fx('Magic/Circle/SpriteSheetSpark.png', 32, 32, 6),
  thunder: fx('Elemental/Thunder/SpriteSheet.png', 20, 28, 8),
  frost: fx('Elemental/Ice/SpriteSheetFlake.png', 32, 32, 9),
  rockspike: fx('Elemental/RockSpike/SpriteSheet.png', 54, 48, 10),
  waterpillar: fx('Elemental/WaterPillar/SpriteSheet.png', 30, 41, 9),
  boost: fx('Magic/Boost/SpriteSheet.png', 53, 35, 8),
  magic: fx('Magic/Spark/SpriteSheet.png', 27, 35, 10),
  flame: fx('Elemental/Flam/SpriteSheet.png', 25, 30, 8),
};
export type FxKey = keyof typeof FX;

export const ARROW_PATH = `${BASE}/FX/Projectile/Arrow.png`;

/** Hand-held weapons shown during attacks (the character sheets only have one attack pose). */
export const WEAPONS = {
  sword: `${BASE}/Items/Weapons/Sword/SpriteInHand.png`,
  axe: `${BASE}/Items/Weapons/Axe/SpriteInHand.png`,
  hammer: `${BASE}/Items/Weapons/Hammer/SpriteInHand.png`,
  lance: `${BASE}/Items/Weapons/Lance/SpriteInHand.png`,
  wand: `${BASE}/Items/Weapons/MagicWand/SpriteInHand.png`,
  bow: `${BASE}/Items/Weapons/Bow/Sprite.png`,
} as const;
export type WeaponKey = keyof typeof WEAPONS;

/** Animated projectiles (16x16 frames); pierce uses the static arrow. */
export const PROJECTILES = {
  magic: { path: `${BASE}/FX/Projectile/EnergyBall.png`, frames: 4 },
  chaos: { path: `${BASE}/FX/Projectile/Fireball.png`, frames: 4 },
  siege: { path: `${BASE}/FX/Projectile/CanonBall.png`, frames: 5 },
} as const;

const SKILL = `${BASE}/Ui/Skill Icon`;
/** HUD icons: small inline ones and 24x24 button icons. Paths contain spaces and '&'. */
export const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries({
    'icon-coin': `${BASE}/Items/Treasure/GoldCoin.png`,
    'icon-heart': `${BASE}/Items/Potion/Heart.png`,
    'btn-worker': `${SKILL}/Job & Action/Harvest.png`,
    'btn-hp': `${SKILL}/Job & Action/Potion.png`,
    'btn-attack': `${SKILL}/Spell/AttackUpgrade.png`,
    'btn-regen': `${SKILL}/Spell/Heal.png`,
    'btn-upgrade': `${SKILL}/Spell/Upgrade.png`,
    'btn-sell': `${SKILL}/Items & Weapon/Money.png`,
    'btn-view': `${SKILL}/Spell/Vision.png`,
    'btn-farm': `${SKILL}/Job & Action/Plant.png`,
  }).map(([k, v]) => [k, encodeURI(v)]),
);
export const FONT_PATH = `${BASE}/Ui/Font/font8x8.png`;

// These characters ship without Idle.png; the walk sheet's first row has the same layout.
const NO_IDLE = new Set(['NinjaFire', 'NinjaLeaf', 'NinjaThunder', 'NinjaWater']);

export function characterPath(folder: string, anim: 'Walk' | 'Idle' | 'Attack' | 'Dead'): string {
  const file = anim === 'Idle' && NO_IDLE.has(folder) ? 'Walk' : anim;
  return `${BASE}/Actor/Character/${folder}/SeparateAnim/${file}.png`;
}

export function facesetPath(folder: string, kind: SpriteSpec['kind']): string {
  return `${BASE}/Actor/${kind === 'character' ? 'Character' : 'Monster'}/${folder}/Faceset.png`;
}

export function monsterPath(folder: string): string {
  const file = MONSTER_FILES[folder];
  if (!file) throw new Error(`unknown monster sprite ${folder}`);
  return `${BASE}/Actor/Monster/${folder}/${file}.png`;
}

export function bossPath(folder: string, anim: 'Idle' | 'Hit' | 'AttackLeft'): string {
  return `${BASE}/Actor/Boss/${folder}/${anim}.png`;
}

/** Texture/animation key prefix; the pack has a character and a monster both named e.g. "Spirit". */
export function spriteKey(spec: SpriteSpec): string {
  return spec.kind === 'monster' ? `m-${spec.folder}` : spec.folder;
}
