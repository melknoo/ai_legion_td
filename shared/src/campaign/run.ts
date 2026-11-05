import type { CampaignConfig, CampaignStart } from '../sim/game.ts';
import { Rng } from '../sim/rng.ts';
import type { GameData } from '../sim/types.ts';
import { draftOptions, starterOptions } from './draft.ts';
import { AFFIXES, findNode, generateAct, type ActMap, type MapNode } from './map.ts';
import { PIGGY_BANK, PIGGY_MAX, PIGGY_RATE, RELICS, TIN_CROWN, TIN_CROWN_HP, relicOptions } from './relics.ts';
import {
  ACTS,
  DRAFT_TIERS,
  PRICES,
  REST_HEAL,
  ROSTER_CAP,
  SHOP_HEAL,
  SKIP_LUMBER,
  campaignData,
  incomeAt,
  kingMaxHp,
  seedFor,
} from './rules.ts';

/**
 * A campaign run: pure data plus pure transitions (each returns a new state, invalid actions return
 * the input unchanged). The client renders it and persists it; battles run in a normal Game built
 * from `nodeBattle`, whose snapshot comes back through `finishBattle`.
 */
export const RUN_VERSION = 1;

export type RunStatus = 'map' | 'battle' | 'reward' | 'shop' | 'rest' | 'won' | 'lost';

export type Reward = { kind: 'draft'; options: string[] } | { kind: 'relic'; options: string[] };

export type ShopOffer = { kind: 'relic'; relic: string; price: number; sold?: boolean } | { kind: 'heal' | 'draft'; price: number; sold?: boolean };

export interface RunStats {
  waves: number;
  nodes: number;
  leaks: number;
  elites: number;
}

export interface RunState {
  version: number;
  seed: number;
  builder: string;
  act: number;
  map: ActMap;
  /** Node entered last (null before the first). */
  at: string | null;
  visited: string[];
  relics: string[];
  /** Army between nodes. players[i].income holds only the extra income (king upgrades); base income is added per node. */
  army: CampaignStart;
  /** Choices still to make, first one shown. */
  rewards: Reward[];
  /** Where to go once the rewards are done. */
  returnTo: 'map' | 'shop';
  shop: ShopOffer[];
  status: RunStatus;
  stats: RunStats;
}

const clone = (run: RunState): RunState => JSON.parse(JSON.stringify(run)) as RunState;

export function newRun(d: GameData, seed: number, builder: string): RunState {
  const r = d.rules;
  return {
    version: RUN_VERSION,
    seed: seed >>> 0,
    builder,
    act: 1,
    map: generateAct(seed, 1),
    at: null,
    visited: [],
    relics: [],
    army: {
      players: [
        {
          gold: r.startGold,
          lumber: r.startLumber,
          income: 0,
          workers: r.startWorkers,
          farmLevel: 0,
          foodCap: r.startFood,
          fighters: [],
        },
      ],
      units: [],
      king: { hp: d.units[r.king.unit]!.hp, levels: { hp: 0, attack: 0, regen: 0 } },
    },
    // The run starts with one fighter: a pick from the builder's first two tiers.
    rewards: [{ kind: 'draft', options: starterOptions(d, builder) }],
    returnTo: 'map',
    shop: [],
    status: 'reward',
    stats: { waves: 0, nodes: 0, leaks: 0, elites: 0 },
  };
}

export function currentNode(run: RunState): MapNode | undefined {
  return run.at ? findNode(run.map, run.at) : undefined;
}

/** Nodes the player can move to now. */
export function reachable(run: RunState): MapNode[] {
  if (run.status !== 'map') return [];
  const at = currentNode(run);
  if (!at) return run.map.rows[0] ?? [];
  return at.next.map((id) => findNode(run.map, id)!).filter(Boolean);
}

/** Data the run's games use: the base data with campaign rules and the run's relics. */
export function runData(run: RunState, base: GameData): GameData {
  return campaignData(base, run.relics);
}

export function kingMax(run: RunState, base: GameData): number {
  return kingMaxHp(runData(run, base), run.army.king.levels.hp);
}

const rngFor = (run: RunState, ...parts: (string | number)[]) => new Rng(seedFor(run.seed, ...parts));

export function enterNode(run: RunState, base: GameData, nodeId: string): RunState {
  if (!reachable(run).some((n) => n.id === nodeId)) return run;
  const next = clone(run);
  const node = findNode(next.map, nodeId)!;
  next.at = node.id;
  next.visited.push(node.id);
  next.stats.nodes++;
  switch (node.kind) {
    case 'battle':
    case 'elite':
    case 'boss':
      next.status = 'battle';
      break;
    case 'shop': {
      const rng = rngFor(next, 'shop', node.id);
      next.shop = [
        ...relicOptions(rng, next.relics, 2).map((relic): ShopOffer => ({ kind: 'relic', relic, price: PRICES.relic })),
        { kind: 'heal', price: PRICES.heal },
        { kind: 'draft', price: PRICES.draft },
      ];
      next.status = 'shop';
      break;
    }
    case 'rest':
      next.status = 'rest';
      break;
    case 'treasure':
      next.rewards = [{ kind: 'relic', options: relicOptions(rngFor(next, 'treasure', node.id), next.relics, 2) }];
      next.returnTo = 'map';
      settleRewards(next);
      break;
  }
  return next;
}

export interface NodeBattle {
  data: GameData;
  seed: number;
  campaign: CampaignConfig;
  node: MapNode;
}

/** Everything needed to start the current combat node's Game (same node → same seed → same waves). */
export function nodeBattle(run: RunState, base: GameData): NodeBattle | null {
  const node = currentNode(run);
  if (run.status !== 'battle' || !node?.waves) return null;
  const data = runData(run, base);
  const [firstWave, lastWave] = node.waves;
  const start: CampaignStart = JSON.parse(JSON.stringify(run.army)) as CampaignStart;
  for (const p of start.players) p.income += incomeAt(firstWave);
  const creep = data.waves[firstWave - 1]?.creep ?? '';
  const affix = node.affix && Object.hasOwn(AFFIXES, node.affix) ? AFFIXES[node.affix]!.make(data, creep) : undefined;
  return {
    data,
    seed: seedFor(run.seed, 'battle', node.id),
    node,
    campaign: { firstWave, lastWave, start, ...(affix ? { affix } : {}) },
  };
}

export interface BattleResult {
  won: boolean;
  /** Game.campaignState() after the node (required when won). */
  state?: CampaignStart;
  leaks?: number;
}

export function finishBattle(run: RunState, base: GameData, result: BattleResult): RunState {
  const node = currentNode(run);
  if (run.status !== 'battle' || !node?.waves) return run;
  const next = clone(run);
  next.stats.leaks += result.leaks ?? 0;
  if (!result.won || !result.state) {
    next.army.king.hp = 0;
    next.status = 'lost';
    return next;
  }
  const [firstWave, lastWave] = node.waves;
  next.army = JSON.parse(JSON.stringify(result.state)) as CampaignStart;
  for (const p of next.army.players) p.income = Math.max(0, p.income - incomeAt(firstWave));
  next.stats.waves += lastWave - firstWave + 1;
  if (next.relics.includes(PIGGY_BANK)) {
    for (const p of next.army.players) p.gold += Math.min(PIGGY_MAX, Math.floor(p.gold * PIGGY_RATE));
  }
  if (node.kind === 'boss' && next.act >= ACTS) {
    next.status = 'won';
    return next;
  }
  const tiers = DRAFT_TIERS[next.act] ?? DRAFT_TIERS[1]!;
  const bonus = node.kind === 'elite' || node.kind === 'boss' ? 1 : 0;
  const window: [number, number] = [tiers[0], Math.min(6, tiers[1] + bonus)];
  const rng = rngFor(next, 'reward', node.id);
  const options = draftOptions(base, next.builder, next.army.players[0]!.fighters, window, rng);
  next.rewards = options.length ? [{ kind: 'draft', options }] : [];
  if (node.kind === 'elite') {
    next.stats.elites++;
    const relics = relicOptions(rng, next.relics, 2);
    if (relics.length) next.rewards.push({ kind: 'relic', options: relics });
  }
  next.returnTo = 'map';
  settleRewards(next);
  return next;
}

/** Status after a change to the reward queue. */
function settleRewards(run: RunState): void {
  run.status = run.rewards.length ? 'reward' : run.returnTo;
}

/**
 * Takes the current reward. `pick` = option index, or null to skip (a skipped draft pays lumber).
 * A draft into a full roster needs `replace`: the roster fighter to drop (built units stay).
 */
export function chooseReward(run: RunState, base: GameData, pick: number | null, replace?: string): RunState {
  const reward = run.rewards[0];
  if (run.status !== 'reward' || !reward) return run;
  if (pick !== null && !reward.options[pick]) return run;
  // The starting pick can't be skipped: an empty roster can't build anything.
  if (pick === null && reward.kind === 'draft' && run.army.players[0]!.fighters.length === 0) return run;
  const next = clone(run);
  const me = next.army.players[0]!;
  next.rewards.shift();
  if (pick === null) {
    if (reward.kind === 'draft') me.lumber += SKIP_LUMBER;
  } else if (reward.kind === 'draft') {
    const id = reward.options[pick]!;
    if (me.fighters.length >= ROSTER_CAP) {
      const i = replace === undefined ? -1 : me.fighters.indexOf(replace);
      if (i < 0) return run;
      me.fighters.splice(i, 1);
    }
    me.fighters.push(id);
  } else {
    gainRelic(next, base, reward.options[pick]!);
  }
  settleRewards(next);
  return next;
}

function gainRelic(run: RunState, base: GameData, id: string): void {
  if (!Object.hasOwn(RELICS, id) || run.relics.includes(id)) return;
  run.relics.push(id);
  // A bigger crown also fills the new HP.
  if (id === TIN_CROWN) run.army.king.hp += Math.round(base.units[base.rules.king.unit]!.hp * TIN_CROWN_HP);
}

function heal(run: RunState, base: GameData, share: number): void {
  const max = kingMax(run, base);
  run.army.king.hp = Math.min(max, run.army.king.hp + Math.round(max * share));
}

export function shopBuy(run: RunState, base: GameData, index: number): RunState {
  const offer = run.shop[index];
  const me = run.army.players[0]!;
  if (run.status !== 'shop' || !offer || offer.sold || me.lumber < offer.price) return run;
  const next = clone(run);
  const o = next.shop[index]!;
  next.army.players[0]!.lumber -= o.price;
  o.sold = true;
  if (o.kind === 'relic') gainRelic(next, base, o.relic);
  else if (o.kind === 'heal') heal(next, base, SHOP_HEAL);
  else {
    const tiers = DRAFT_TIERS[next.act] ?? DRAFT_TIERS[1]!;
    const options = draftOptions(base, next.builder, next.army.players[0]!.fighters, tiers, rngFor(next, 'shop-draft', next.at ?? ''));
    if (options.length) {
      next.rewards = [{ kind: 'draft', options }];
      next.returnTo = 'shop';
      settleRewards(next);
    }
  }
  return next;
}

export function leaveShop(run: RunState): RunState {
  if (run.status !== 'shop') return run;
  const next = clone(run);
  next.shop = [];
  next.status = 'map';
  return next;
}

/** Rest: heal the king, or train (one more worker; gold if workers are maxed). */
export function rest(run: RunState, base: GameData, choice: 'heal' | 'train'): RunState {
  if (run.status !== 'rest') return run;
  const next = clone(run);
  if (choice === 'heal') heal(next, base, REST_HEAL);
  else {
    const me = next.army.players[0]!;
    if (me.workers < base.rules.maxWorkers) me.workers++;
    else me.gold += base.rules.workerCost;
  }
  next.status = 'map';
  return next;
}

/** Unknown or incompatible saves return null (never overwrite them). */
export function parseRun(json: string): RunState | null {
  try {
    const run = JSON.parse(json) as RunState;
    if (!run || run.version !== RUN_VERSION || !run.map?.rows || !run.army?.players?.length) return null;
    return run;
  } catch {
    return null;
  }
}
