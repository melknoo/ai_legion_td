import type { GameData } from '../sim/types.ts';
import { applyRelics } from './relics.ts';

/** Campaign tuning. Numbers are first guesses; tools/campaign/sim.ts is the place to check them. */
export const ROSTER_CAP = 10;
/** Waves per act; the last one is the act boss. */
export const ACT_WAVES = 10;
/** Acts in a full run (M1 ships act 1 only). */
export const ACTS = 1;
/** Tier window of drafted fighters per act; elites and bosses offer one tier higher. */
export const DRAFT_TIERS: Record<number, [number, number]> = { 1: [1, 3], 2: [2, 5], 3: [4, 6] };
export const DRAFT_OPTIONS = 3;
/** Own builder fighters offered first, at most this many per draft; the rest come from other builders. */
export const DRAFT_OWN_MAX = 2;
/** Lumber prices in the shop, lumber for skipping a draft. */
export const PRICES = { relic: 90, heal: 50, draft: 60 } as const;
export const SKIP_LUMBER = 20;
/** Share of the king's max HP healed at a rest and bought in the shop. */
export const REST_HEAL = 0.3;
export const SHOP_HEAL = 0.25;

/** Base income per wave cleared (classic income comes from sends, which the campaign has none of). */
export function incomeAt(wave: number): number {
  return 4 + 2 * wave;
}

/** Stable 32-bit seed from a run seed and labels (FNV-1a). */
export function seedFor(seed: number, ...parts: (string | number)[]): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h >>> 0;
}

/** King max HP for a number of HP upgrades, as Game.upgradeKing adds them. */
export function kingMaxHp(d: GameData, hpLevel: number): number {
  const k = d.rules.king;
  let hp = d.units[k.unit]!.hp;
  for (let l = 1; l <= hpLevel; l++) hp += k.hpBase + k.hpStep * l;
  return hp;
}

/** Game data for campaign nodes: no sends, no arena, no wave-based king buffs; relics applied. */
export function campaignData(base: GameData, relics: readonly string[]): GameData {
  const d: GameData = {
    ...base,
    mercs: {},
    rules: {
      ...base.rules,
      arenaWaves: [],
      // Nodes can replay a wave number, so wave-based king buffs would stack; the king grows by upgrades and relics.
      king: { ...base.rules.king, buffEvery: Number.MAX_SAFE_INTEGER, grants: [] },
    },
  };
  return applyRelics(d, relics);
}
