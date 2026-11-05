import { Rng } from '../sim/rng.ts';
import { MELEE_RANGE, type GameData, type UnitDef } from '../sim/types.ts';

/**
 * Relics: run-long boons. Most change a copy of the game data (stats, abilities, rules), so the
 * sim needs no special cases; the few run-level ones (interest, pickup heal) live in run.ts.
 */
export interface RelicDef {
  id: string;
  name: string;
  /** One HUD line, upper case. */
  text: string;
  rarity: 'common' | 'rare';
  data?: (d: GameData) => GameData;
}

/** Every fighter id a builder can field: base fighters and all their upgrades. */
export function fighterIds(d: GameData): Set<string> {
  const ids = new Set<string>();
  const todo = Object.values(d.builders).flatMap((b) => b.fighters);
  while (todo.length) {
    const id = todo.pop()!;
    if (ids.has(id) || !d.units[id]) continue;
    ids.add(id);
    todo.push(...(d.units[id]!.upgradesTo ?? []));
  }
  return ids;
}

/** Ids reachable only by upgrading (their goldCost is the upgrade price). */
function upgradeIds(d: GameData): Set<string> {
  const ups = new Set<string>();
  for (const id of fighterIds(d)) for (const to of d.units[id]!.upgradesTo ?? []) ups.add(to);
  return ups;
}

function mapUnits(d: GameData, ids: Iterable<string>, fn: (u: UnitDef) => UnitDef): GameData {
  const units = { ...d.units };
  for (const id of ids) if (units[id]) units[id] = fn(units[id]!);
  return { ...d, units };
}

const isMelee = (u: UnitDef) => u.attack.range <= MELEE_RANGE;
const fightersWhere = (d: GameData, pred: (u: UnitDef) => boolean) => [...fighterIds(d)].filter((id) => pred(d.units[id]!));

export const PIGGY_BANK = 'piggy-bank';
export const TIN_CROWN = 'tin-crown';
export const PIGGY_RATE = 0.1;
export const PIGGY_MAX = 50;
export const TIN_CROWN_HP = 0.15;

const RELIC_LIST: RelicDef[] = [
  {
    id: 'whetstone',
    name: 'Whetstone',
    text: 'MELEE FIGHTERS +10% DAMAGE',
    rarity: 'common',
    data: (d) =>
      mapUnits(d, fightersWhere(d, isMelee), (u) => ({
        ...u,
        attack: { ...u.attack, damage: [Math.round(u.attack.damage[0] * 1.1), Math.round(u.attack.damage[1] * 1.1)] },
      })),
  },
  {
    id: 'fletchers-kit',
    name: "Fletcher's Kit",
    text: 'RANGED FIGHTERS +10% ATTACK SPEED',
    rarity: 'common',
    data: (d) =>
      mapUnits(d, fightersWhere(d, (u) => !isMelee(u)), (u) => ({ ...u, attack: { ...u.attack, cooldownMs: Math.round(u.attack.cooldownMs / 1.1) } })),
  },
  {
    id: TIN_CROWN,
    name: 'Tin Crown',
    text: 'KING +15% MAX HP',
    rarity: 'common',
    data: (d) => mapUnits(d, [d.rules.king.unit], (u) => ({ ...u, hp: Math.round(u.hp * (1 + TIN_CROWN_HP)) })),
  },
  {
    id: PIGGY_BANK,
    name: 'Piggy Bank',
    text: 'AFTER EACH FIGHT +10% GOLD (MAX 50)',
    rarity: 'common',
  },
  {
    id: 'woodsmans-axe',
    name: "Woodsman's Axe",
    text: 'WORKERS CUT +1 LUMBER PER TRIP',
    rarity: 'common',
    data: (d) => ({ ...d, rules: { ...d.rules, lumberPerWorker: d.rules.lumberPerWorker + 1 } }),
  },
  {
    id: 'vampire-fang',
    name: 'Vampire Fang',
    text: 'MELEE FIGHTERS HEAL 8% OF DAMAGE',
    rarity: 'rare',
    data: (d) =>
      mapUnits(d, fightersWhere(d, isMelee), (u) => ({
        ...u,
        abilities: [...(u.abilities ?? []), { name: 'Vampire Fang', kind: 'lifesteal', ratio: 0.08 }],
      })),
  },
  {
    id: 'veterans-medal',
    name: "Veteran's Medal",
    text: 'UPGRADES COST 15% LESS',
    rarity: 'rare',
    data: (d) => mapUnits(d, upgradeIds(d), (u) => (u.goldCost ? { ...u, goldCost: Math.round(u.goldCost * 0.85) } : u)),
  },
];

export const RELICS: Record<string, RelicDef> = Object.fromEntries(RELIC_LIST.map((r) => [r.id, r]));

/** Up to `n` different relics the player does not own yet (rares half as likely). */
export function relicOptions(rng: Rng, owned: readonly string[], n: number): string[] {
  const pool = RELIC_LIST.filter((r) => !owned.includes(r.id));
  const out: string[] = [];
  while (out.length < n && pool.length) {
    const weights = pool.map((r) => (r.rarity === 'rare' ? 1 : 2));
    let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (roll >= weights[i]!) roll -= weights[i++]!;
    out.push(pool.splice(i, 1)[0]!.id);
  }
  return out;
}

/** Game data with the relics' data changes applied (unknown ids are ignored). */
export function applyRelics(d: GameData, relics: readonly string[]): GameData {
  let out = d;
  for (const id of relics) {
    const r = Object.hasOwn(RELICS, id) ? RELICS[id] : undefined;
    if (r?.data) out = r.data(out);
  }
  return out;
}
