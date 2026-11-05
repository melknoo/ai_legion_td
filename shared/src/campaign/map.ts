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
  /** Combat nodes: first and last wave number. */
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

/** First wave (within the act) a combat node in this row plays: 1,2,3,5,6,8 → waves 1–9. */
export function rowFirstWave(row: number): number {
  return 1 + Math.floor(((row - 1) * 7) / 5);
}

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
  for (const row of rows) {
    for (const n of row) {
      if (n.kind === 'battle' || n.kind === 'elite') {
        const w = offset + rowFirstWave(n.row);
        n.waves = [w, w + 1];
      } else if (n.kind === 'boss') {
        n.waves = [offset + ACT_WAVES, offset + ACT_WAVES];
      }
      if (n.kind === 'elite') n.affix = rng.pick(AFFIX_IDS);
    }
  }
  for (let r = 0; r + 1 < rows.length; r++) linkRows(rng, rows[r]!, rows[r + 1]!);
  return { act, rows };
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
