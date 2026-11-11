import { describe, expect, it } from 'vitest';
import { LEGION_DATA } from '../data/legion.ts';
import { botCommands } from '../sim/bot.ts';
import { Game } from '../sim/game.ts';
import { Rng } from '../sim/rng.ts';
import { campaignBuilders, draftOptions, fighterTier, starterOptions } from './draft.ts';
import { MAP_ROWS, MIN_FIGHTS, findNode, generateAct, isFight, type ActMap, type MapNode } from './map.ts';
import { RELICS, applyRelics, relicOptions } from './relics.ts';
import { ROSTER_CAP, SKIP_LUMBER, campaignData, kingMaxHp } from './rules.ts';
import {
  chooseReward,
  enterNode,
  finishBattle,
  kingMax,
  leaveShop,
  newRun,
  nodeBattle,
  parseRun,
  reachable,
  nodeWaves,
  rest,
  shopBuy,
  type RunState,
} from './run.ts';

const D = LEGION_DATA;
/** New run with the starting pick made (the tier-2 fighter). */
const started = (seed: number, builder: string) => chooseReward(newRun(D, seed, builder), D, 1);
/** Fights on every path from row 1 to the boss. */
function pathFights(map: ActMap): number[] {
  const walk = (n: MapNode, fights: number): number[] =>
    n.kind === 'boss' ? [fights] : n.next.flatMap((id) => walk(findNode(map, id)!, fights + (isFight(n) ? 1 : 0)));
  return map.rows[0]!.flatMap((n) => walk(n, 0));
}
const crossing = (a: [number, number], b: [number, number]) => (a[0] < b[0] && a[1] > b[1]) || (a[0] > b[0] && a[1] < b[1]);

describe('act map', () => {
  it('follows the row rules for many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const map = generateAct(seed, 1);
      expect(map.rows).toHaveLength(MAP_ROWS);
      expect(map.rows[0]!.every((n) => n.kind === 'battle')).toBe(true);
      expect(map.rows[MAP_ROWS - 2]!.every((n) => n.kind === 'rest')).toBe(true);
      expect(map.rows[MAP_ROWS - 1]!.map((n) => n.kind)).toEqual(['boss']);
      expect(map.rows.slice(2, 5).some((r) => r.some((n) => n.kind === 'shop'))).toBe(true);
      expect(map.rows.slice(0, 2).some((r) => r.some((n) => n.kind === 'elite'))).toBe(false);
      for (const row of map.rows.slice(1, -2)) for (const k of ['elite', 'shop', 'rest']) expect(row.filter((n) => n.kind === k).length).toBeLessThanOrEqual(1);
      for (const row of map.rows) {
        for (const n of row) {
          if (n.kind === 'elite') expect(n.affix).toBeDefined();
          if (n.row < MAP_ROWS) expect(n.next.length).toBeGreaterThan(0);
        }
      }
      // Waves only advance by fighting: every path to the boss has enough fights.
      expect(Math.min(...pathFights(map))).toBeGreaterThanOrEqual(MIN_FIGHTS);
      // Every node is reachable, and no two paths cross.
      for (let r = 1; r < map.rows.length; r++) {
        for (const n of map.rows[r]!) expect(map.rows[r - 1]!.some((m) => m.next.includes(n.id))).toBe(true);
        const edges = map.rows[r - 1]!.flatMap((m) => m.next.map((id) => [m.col, findNode(map, id)!.col] as [number, number]));
        for (const a of edges) for (const b of edges) expect(crossing(a, b)).toBe(false);
      }
    }
  });

  it('is deterministic; the boss plays wave 10', () => {
    expect(generateAct(7, 1)).toEqual(generateAct(7, 1));
    expect(generateAct(7, 1).rows.at(-1)![0]!.waves).toEqual([10, 10]);
  });
});

describe('draft', () => {
  it('offers missing own fighters first, then other builders, inside the tier window', () => {
    const builder = 'frost';
    const own = D.builders[builder]!.fighters;
    const opts = draftOptions(D, builder, [own[0]!], [1, 3], new Rng(1));
    expect(opts).toHaveLength(3);
    expect(opts.filter((id) => own.includes(id)).sort()).toEqual([own[1]!, own[2]!].sort());
    for (const id of opts) {
      expect(D.units[id]!.tier).toBeGreaterThanOrEqual(1);
      expect(D.units[id]!.tier).toBeLessThanOrEqual(3);
      expect(D.units[id]!.morph).toBeUndefined();
    }
    const full = draftOptions(D, builder, own, [1, 3], new Rng(2));
    expect(full.some((id) => own.includes(id))).toBe(false);
  });

  it('starts every builder (not the prophet) with a pick of its tier-1 and tier-2 fighter', () => {
    const builders = campaignBuilders(D);
    expect(builders).not.toContain('prophet');
    expect(builders).toContain('chimera');
    for (const b of builders) expect(starterOptions(D, b).map((id) => fighterTier(D, id))).toEqual([1, 2]);
    // Moonblade has no tier in the data: its cost rank stands in.
    expect(fighterTier(D, 'moonblade')).toBe(6);
  });
});

describe('relics', () => {
  it('change copies of the data only', () => {
    const before = JSON.stringify(D);
    const d = applyRelics(campaignData(D, []), Object.keys(RELICS));
    expect(JSON.stringify(D)).toBe(before);
    expect(d.units.king!.hp).toBeGreaterThan(D.units.king!.hp);
    expect(d.rules.lumberPerWorker).toBe(D.rules.lumberPerWorker + 1);
    expect(Object.keys(d.mercs)).toHaveLength(0);
    expect(d.rules.arenaWaves).toEqual([]);
  });

  it('are offered without duplicates or owned ones', () => {
    const opts = relicOptions(new Rng(3), ['whetstone'], 3);
    expect(new Set(opts).size).toBe(3);
    expect(opts).not.toContain('whetstone');
    expect(relicOptions(new Rng(3), Object.keys(RELICS), 2)).toEqual([]);
  });
});

/** Plays the current combat node with the bot in the player's seat. */
function playNode(run: RunState): RunState {
  const b = nodeBattle(run, D)!;
  const g = new Game({ seed: b.seed, data: b.data, players: [{ id: 'me', name: 'Me', team: 0, builder: run.builder }], campaign: b.campaign });
  for (let i = 0; i < 100_000 && g.phase !== 'over'; i++) {
    for (const cmd of botCommands(g, 0)) g.apply(cmd);
    g.tick();
  }
  const won = g.winner === 0;
  return finishBattle(run, D, { won, state: won ? g.campaignState() : undefined, leaks: g.players[0]!.leaks });
}

describe('run', () => {
  it('starts with a pick of one fighter, then the map; the king at full HP', () => {
    const start = newRun(D, 5, 'grove');
    expect(start.status).toBe('reward');
    expect(chooseReward(start, D, null)).toBe(start);
    const run = chooseReward(start, D, 1);
    expect(run.status).toBe('map');
    expect(run.army.players[0]!.fighters).toEqual([starterOptions(D, 'grove')[1]]);
    expect(run.army.king.hp).toBe(kingMax(run, D));
    expect(reachable(run).map((n) => n.row)).toEqual([1, 1, 1]);
    expect(enterNode(run, D, 'nonsense')).toBe(run);
  });

  it('lets the player start the wave early, in the campaign only', () => {
    let run = started(5, 'grove');
    run = enterNode(run, D, reachable(run)[0]!.id);
    const b = nodeBattle(run, D)!;
    const g = new Game({ seed: b.seed, data: b.data, players: [{ id: 'me', name: 'Me', team: 0, builder: run.builder }], campaign: b.campaign });
    expect(g.phase).toBe('build');
    expect(g.apply({ type: 'startWave', player: 0 })).toEqual({ ok: true });
    g.tick();
    expect(g.phase).toBe('fight');
    expect(g.apply({ type: 'startWave', player: 0 }).ok).toBe(false);
    const classic = new Game({ seed: 1, data: D, players: [{ id: 'a', name: 'A', team: 0, builder: 'grove' }, { id: 'b', name: 'B', team: 1, builder: 'grove' }] });
    expect(classic.apply({ type: 'startWave', player: 0 })).toEqual({ ok: false, error: 'campaign only' });
  });

  it('plays a battle node, keeps the army and offers a draft', () => {
    let run = started(5, 'grove');
    run = enterNode(run, D, reachable(run)[0]!.id);
    expect(run.status).toBe('battle');
    const b = nodeBattle(run, D)!;
    expect([b.campaign.firstWave, b.campaign.lastWave]).toEqual([1, 2]);
    // Same node, same seed: a restarted node replays the same waves.
    expect(nodeBattle(run, D)!.seed).toBe(b.seed);
    run = playNode(run);
    expect(run.status).toBe('reward');
    expect(run.stats.waves).toBe(2);
    expect(run.wave).toBe(3);
    expect(run.army.units.length).toBeGreaterThan(0);
    expect(run.rewards[0]!.kind).toBe('draft');
    const pick = run.rewards[0]!.options[0]!;
    const after = chooseReward(run, D, 0);
    expect(after.army.players[0]!.fighters).toContain(pick);
    expect(after.status).toBe('map');
    const skipped = chooseReward(run, D, null);
    expect(skipped.army.players[0]!.lumber).toBe(run.army.players[0]!.lumber + SKIP_LUMBER);
    // Moving on: only the linked nodes of the next row.
    expect(reachable(after).every((n) => n.row === 2)).toBe(true);
  });

  it('fights the next waves in order: detours skip none, the last two repeat before the boss', () => {
    const run = started(5, 'grove');
    const battle = run.map.rows.flat().find((n) => n.kind === 'battle')!;
    const elite = { ...battle, kind: 'elite' as const };
    const boss = run.map.rows.at(-1)![0]!;
    const at = (wave: number) => ({ ...run, wave });
    expect(nodeWaves(at(1), battle)).toEqual([1, 2]);
    // Two fights in, then loot and a shop: the next fight still plays waves 5-6.
    expect(nodeWaves(at(5), battle)).toEqual([5, 6]);
    expect(nodeWaves(at(9), elite)).toEqual([8, 9]);
    expect(nodeWaves(at(12), battle)).toEqual([8, 9]);
    expect(nodeWaves(at(3), boss)).toEqual([10, 10]);
    expect(nodeWaves(run, run.map.rows.flat().find((n) => !isFight(n) && n.kind !== 'boss')!)).toBeNull();
  });

  it('needs a fighter to replace once the roster is full; built units stay', () => {
    let run = started(5, 'grove');
    run = enterNode(run, D, reachable(run)[0]!.id);
    run = playNode(run);
    run.army.players[0]!.fighters = Array.from({ length: ROSTER_CAP }, (_, i) => `x${i}`);
    expect(chooseReward(run, D, 0)).toBe(run);
    const replaced = chooseReward(run, D, 0, 'x3');
    expect(replaced.army.players[0]!.fighters).not.toContain('x3');
    expect(replaced.army.players[0]!.fighters).toHaveLength(ROSTER_CAP);
    expect(replaced.army.units).toEqual(run.army.units);
  });

  it('shops for lumber, rests and heals up to max HP', () => {
    let run = started(9, 'frost');
    run.status = 'shop';
    run.shop = [{ kind: 'relic', relic: 'tin-crown', price: 50 }, { kind: 'heal', price: 10 }];
    run.army.players[0]!.lumber = 55;
    run.army.king.hp = 100;
    run = shopBuy(run, D, 0);
    expect(run.relics).toEqual(['tin-crown']);
    expect(run.army.king.hp).toBe(100 + Math.round(D.units.king!.hp * 0.15));
    expect(shopBuy(run, D, 0)).toBe(run);
    expect(shopBuy(run, D, 1)).toBe(run);
    run = leaveShop(run);
    expect(run.status).toBe('map');
    run.status = 'rest';
    const healed = rest(run, D, 'heal');
    expect(healed.army.king.hp).toBe(Math.min(kingMax(run, D), run.army.king.hp + Math.round(kingMax(run, D) * 0.3)));
    expect(kingMax(run, D)).toBe(kingMaxHp(campaignData(D, ['tin-crown']), 0));
    const trained = rest(run, D, 'train');
    expect(trained.army.players[0]!.workers).toBe(run.army.players[0]!.workers + 1);
  });

  it('is lost when the king falls and round-trips through JSON', () => {
    let run = started(5, 'grove');
    run = enterNode(run, D, reachable(run)[0]!.id);
    const lost = finishBattle(run, D, { won: false });
    expect(lost.status).toBe('lost');
    expect(parseRun(JSON.stringify(run))).toEqual(run);
    expect(parseRun('{"version":99}')).toBeNull();
    // v1 saves (waves by map row) continue after the waves fought so far.
    const v1 = { ...run, version: 1, wave: undefined, stats: { ...run.stats, waves: 4 } };
    expect(parseRun(JSON.stringify(v1))).toMatchObject({ version: 2, wave: 5 });
    expect(parseRun('nope')).toBeNull();
  });
});
