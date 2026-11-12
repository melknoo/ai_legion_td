import { Rng } from '../sim/rng.ts';
import type { GameData } from '../sim/types.ts';
import { DRAFT_OWN_MAX, DRAFT_OPTIONS } from './rules.ts';

/** A fighter's tier; a base fighter missing one in the data gets its cost rank within its builder. */
export function fighterTier(d: GameData, id: string): number {
  const u = d.units[id];
  if (!u) return 0;
  if (u.tier ?? u.morph) return (u.tier ?? u.morph)!;
  const builder = Object.values(d.builders).find((b) => b.fighters.includes(id));
  if (!builder) return 0;
  const byCost = [...builder.fighters].sort((a, b) => (d.units[a]?.goldCost ?? 0) - (d.units[b]?.goldCost ?? 0));
  return byCost.indexOf(id) + 1;
}

/** Builders a campaign can start with: every builder with its own fighters (not the Prophet). */
export function campaignBuilders(d: GameData): string[] {
  return Object.values(d.builders)
    .filter((b) => !b.random && b.fighters.length > 0)
    .map((b) => b.id);
}

/** A run starts with the builder's tier-1 and tier-2 fighters (some T1s are support units, some T2s archers). */
export function starterOptions(d: GameData, builder: string): string[] {
  const fighters = d.builders[builder]?.fighters ?? [];
  return fighters.filter((id) => fighterTier(d, id) <= 2).sort((a, b) => fighterTier(d, a) - fighterTier(d, b));
}

/**
 * Draft offer: own-builder fighters the roster still lacks come first (up to DRAFT_OWN_MAX),
 * the other slots go to base fighters of other builders (no morph eggs). All within the tier window.
 */
export function draftOptions(d: GameData, builder: string, roster: readonly string[], tiers: [number, number], rng: Rng): string[] {
  const inWindow = (id: string) => {
    const t = fighterTier(d, id);
    return t >= tiers[0] && t <= tiers[1] && !roster.includes(id);
  };
  const own = (d.builders[builder]?.fighters ?? []).filter(inWindow);
  const foreign = Object.values(d.builders)
    .filter((b) => b.id !== builder && !b.random)
    .flatMap((b) => b.fighters)
    .filter((id) => inWindow(id) && !d.units[id]!.morph);
  const out: string[] = [];
  const take = (pool: string[]) => {
    const i = rng.int(0, pool.length - 1);
    out.push(pool.splice(i, 1)[0]!);
  };
  while (out.length < DRAFT_OWN_MAX && own.length) take(own);
  while (out.length < DRAFT_OPTIONS && foreign.length) take(foreign);
  while (out.length < DRAFT_OPTIONS && own.length) take(own);
  return out;
}
