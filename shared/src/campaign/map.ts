import type { CreepAffix } from '../sim/game.ts';
import { Rng } from '../sim/rng.ts';
import type { GameData } from '../sim/types.ts';
import { ACT_WAVES, seedFor } from './rules.ts';

export type NodeKind = 'battle' | 'elite' | 'shop' | 'rest' | 'treasure' | 'boss';

export interface MapNode {
  id: string;
  /** 1-based row; the boss is the last row. */
  row: number;
  col: number;
  kind: NodeKind;
  /** Ids of the nodes this one leads to (next row). */
  next: string[];
  /** The boss: its wave number (twice). Other fights play the run's next waves, see run.ts nodeWaves. */
  waves?: [number, number];
  /** Elites: key into AFFIXES. */
  affix?: string;
}

export interface ActMap {
  act: number;
  /** rows[0] = row 1 (start) … last = boss. */
  rows: MapNode[][];
}

/** Rows with mixed nodes, then a rest row, then the boss. */
export const MIXED_ROWS = 6;
export const MAP_ROWS = MIXED_ROWS + 2;

export interface AffixDef {
  name: string;
  text: string;
  /** Built for the node's creep so flat values scale with the wave. */
  make: (d: GameData, creep: string) => CreepAffix;
}

export const AFFIXES: Record<string, AffixDef> = {
  armored: { name: 'Armored', text: 'CREEPS +4 ARMOR', make: () => ({ armor: 4 }) },
  regenerating: {
    name: 'Regenerating',
    text: 'CREEPS REGENERATE 3% HP/S',
    make: (d, creep) => ({ regen: Math.max(1, Math.round((d.units[creep]?.hp ?? 0) * 0.03)) }),
  },
  frenzied: { name: 'Frenzied', text: 'CREEPS +40% ATTACK SPEED', make: () => ({ attackSpeed: 0.4 }) },
  thorny: { name: 'Thorny', text: 'CREEPS REFLECT 15% MELEE DAMAGE', make: () => ({ abilities: [{ name: 'Thorns', kind: 'thorns', ratio: 0.15 }] }) },
  horde: { name: 'Horde', text: '+30% CREEPS, -20% HP', make: () => ({ countMul: 1.3, hpMul: 0.8 }) },
};
const AFFIX_IDS = Object.keys(AFFIXES);

/** Every path through the mixed rows has at least this many fights: 8+ waves before the wave-10 boss. */
export const MIN_FIGHTS = 4;

export const isFight = (n: MapNode) => n.kind === 'battle' || n.kind === 'elite';

const MIXED_WEIGHTS: [NodeKind, number, number][] = [
  // kind, weight, first row it may appear in
  ['battle', 50, 2],
  ['elite', 16, 3],
  ['shop', 12, 2],
  ['rest', 10, 3],
  ['treasure', 10, 2],
];

function pickKind(rng: Rng, row: number): NodeKind {
  const options = MIXED_WEIGHTS.filter(([, , from]) => row >= from);
  let roll = rng.next() * options.reduce((s, [, w]) => s + w, 0);
  for (const [kind, w] of options) {
    if (roll < w) return kind;
    roll -= w;
  }
  return 'battle';
}

const UNIQUE_PER_ROW = new Set<NodeKind>(['elite', 'shop', 'rest']);

const frac = (i: number, w: number) => (w === 1 ? 0.5 : i / (w - 1));

/** Seeded act map. Paths never cross: node i links to the nodes nearest its relative position. */
export function generateAct(seed: number, act: number): ActMap {
  const rng = new Rng(seedFor(seed, 'map', act));
  const offset = (act - 1) * ACT_WAVES;
  const widths = [3, ...Array.from({ length: MIXED_ROWS - 1 }, () => rng.int(2, 4)), 2, 1];
  const rows: MapNode[][] = widths.map((w, r) => {
    const row = r + 1;
    const taken = new Set<NodeKind>();
    return Array.from({ length: w }, (_, col) => {
      let kind: NodeKind = row === 1 ? 'battle' : row === MAP_ROWS ? 'boss' : row === MAP_ROWS - 1 ? 'rest' : pickKind(rng, row);
      // At most one elite, shop or rest per mixed row: most of a row stays plain battles.
      if (row < MAP_ROWS - 1 && UNIQUE_PER_ROW.has(kind) && taken.has(kind)) kind = 'battle';
      taken.add(kind);
      return { id: `${act}-${row}-${col}`, row, col, kind, next: [] };
    });
  });
  // At least one shop in rows 3-5.
  if (!rows.slice(2, 5).some((r) => r.some((n) => n.kind === 'shop'))) {
    const row = rows[rng.int(2, 4)]!;
    row[rng.int(0, row.length - 1)]!.kind = 'shop';
  }
  for (let r = 0; r + 1 < rows.length; r++) linkRows(rng, rows[r]!, rows[r + 1]!);
  ensureFights(rows.slice(0, MIXED_ROWS));
  for (const row of rows) {
    for (const n of row) {
      if (n.kind === 'boss') n.waves = [offset + ACT_WAVES, offset + ACT_WAVES];
      if (n.kind === 'elite') n.affix = rng.pick(AFFIX_IDS);
    }
  }
  return { act, rows };
}

/** Fewest fights on any path into each node, and the node before it on such a path. */
function fewestFights(mixed: MapNode[][]): Map<string, { fights: number; prev: MapNode | null }> {
  const best = new Map<string, { fights: number; prev: MapNode | null }>();
  for (const n of mixed[0]!) best.set(n.id, { fights: isFight(n) ? 1 : 0, prev: null });
  for (let r = 1; r < mixed.length; r++) {
    for (const n of mixed[r]!) {
      let prev: MapNode | null = null;
      for (const m of mixed[r - 1]!) if (m.next.includes(n.id) && (!prev || best.get(m.id)!.fights < best.get(prev.id)!.fights)) prev = m;
      best.set(n.id, { fights: (prev ? best.get(prev.id)!.fights : 0) + (isFight(n) ? 1 : 0), prev });
    }
  }
  return best;
}

/**
 * Waves only advance by fighting, so a path with few fights would reach the boss with a small army.
 * Turns loot, rest or shop nodes on the weakest path into battles until every path has MIN_FIGHTS.
 */
function ensureFights(mixed: MapNode[][]): void {
  const order: NodeKind[] = ['treasure', 'rest', 'shop'];
  const shops = () => mixed.slice(2, 5).flat().filter((n) => n.kind === 'shop').length;
  for (let guard = 0; guard < 20; guard++) {
    const best = fewestFights(mixed);
    const last = mixed.at(-1)!.reduce((a, n) => (best.get(n.id)!.fights < best.get(a.id)!.fights ? n : a));
    if (best.get(last.id)!.fights >= MIN_FIGHTS) return;
    const path: MapNode[] = [];
    for (let n: MapNode | null = last; n; n = best.get(n.id)!.prev) path.unshift(n);
    const candidates = path.filter((n) => !isFight(n)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    // Keep the act's only shop in rows 3-5 if anything else can go.
    const pick = candidates.find((n) => n.kind !== 'shop' || n.row < 3 || n.row > 5 || shops() > 1) ?? candidates[0];
    if (!pick) return;
    pick.kind = 'battle';
  }
}

/** Links each node to the nearest node(s) of the next row without crossing paths. */
function linkRows(rng: Rng, here: MapNode[], there: MapNode[]): void {
  const w = here.length;
  const w2 = there.length;
  const crosses = (n: MapNode, j: number) =>
    here.some((m) => m.next.some((t) => (m.col < n.col && nodeCol(t) > j) || (m.col > n.col && nodeCol(t) < j)));
  const link = (n: MapNode, j: number) => {
    const id = there[j]!.id;
    if (!n.next.includes(id)) n.next.push(id);
  };
  for (const n of here) link(n, Math.round(frac(n.col, w) * (w2 - 1)));
  // Every node of the next row needs a way in: link it from the nearest node.
  for (const t of there) {
    if (here.some((n) => n.next.includes(t.id))) continue;
    const byDistance = [...here].sort((a, b) => Math.abs(frac(a.col, w) - frac(t.col, w2)) - Math.abs(frac(b.col, w) - frac(t.col, w2)));
    link(byDistance.find((n) => !crosses(n, t.col)) ?? byDistance[0]!, t.col);
  }
  // Some branches, so paths offer choices.
  for (const n of here) {
    if (rng.next() >= 0.45) continue;
    const j = nodeCol(n.next[0]!) + (rng.next() < 0.5 ? -1 : 1);
    if (j >= 0 && j < w2 && !crosses(n, j)) link(n, j);
  }
  for (const n of here) n.next.sort((a, b) => nodeCol(a) - nodeCol(b));
}

const nodeCol = (id: string) => Number(id.split('-')[2]);

export function findNode(map: ActMap, id: string): MapNode | undefined {
  for (const row of map.rows) for (const n of row) if (n.id === id) return n;
  return undefined;
}
