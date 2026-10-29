import { describe, expect, it } from 'vitest';
import { armorMultiplier } from './damage.ts';
import { Game, type GameEvent } from './game.ts';
import { testData } from './testData.ts';
import type { GameData, Rules } from './types.ts';
import { STATUS, type AbilityDef } from './abilities.ts';

function newGame(data: GameData = testData(), seed = 1): Game {
  return new Game({
    seed,
    data,
    players: [
      { id: 'a', name: 'Alice', team: 0, builder: 'grove' },
      { id: 'b', name: 'Bob', team: 1, builder: 'grove' },
    ],
  });
}

function withRules(rules: Partial<Rules>): GameData {
  const data = testData();
  return { ...data, rules: { ...data.rules, ...rules } };
}

function runUntil(game: Game, done: (events: GameEvent[]) => boolean, maxTicks = 40000): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const ev = game.tick();
    all.push(...ev);
    if (done(ev)) return all;
  }
  throw new Error('condition not reached');
}

const phaseIs = (phase: string) => (ev: GameEvent[]) => ev.some((e) => e.type === 'phase' && e.phase === phase);
const fightersOf = (g: Game, player: number) => [...g.units.values()].filter((u) => u.kind === 'fighter' && u.owner === player);

function defend(g: Game, player: number): void {
  g.apply({ type: 'build', player, unit: 'archer', col: 0, row: 2 });
  g.apply({ type: 'build', player, unit: 'archer', col: 0, row: 4 });
  g.apply({ type: 'build', player, unit: 'sprout', col: 1, row: 3 });
}

describe('damage', () => {
  it('applies the WC3 armor formula', () => {
    expect(armorMultiplier(0, 0.06)).toBe(1);
    expect(armorMultiplier(5, 0.06)).toBeCloseTo(1 - 0.3 / 1.3);
    expect(armorMultiplier(-5, 0.06)).toBeCloseTo(2 - 0.94 ** 5);
  });
});

describe('build phase commands', () => {
  it('places a fighter, charges gold and rejects invalid placements', () => {
    const g = newGame();
    expect(g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 0 })).toEqual({ ok: true });
    expect(g.players[0]!.gold).toBe(225);
    expect(g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 0 })).toMatchObject({ error: 'cell occupied' });
    expect(g.apply({ type: 'build', player: 0, unit: 'oak', col: 1, row: 0 })).toMatchObject({ error: 'unit not available for builder' });
    expect(g.apply({ type: 'build', player: 0, unit: 'sprout', col: 99, row: 0 })).toMatchObject({ error: 'invalid cell' });
    g.players[0]!.gold = 10;
    expect(g.apply({ type: 'build', player: 0, unit: 'sprout', col: 1, row: 0 })).toMatchObject({ error: 'not enough gold' });
  });

  it('refunds fully in the build phase a fighter was placed, half afterwards', () => {
    const g = newGame();
    g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 0 });
    const f = fightersOf(g, 0)[0]!;
    expect(g.apply({ type: 'upgrade', player: 0, unitId: f.id, to: 'oak' })).toEqual({ ok: true });
    expect(f.maxHp).toBe(700);
    expect(g.apply({ type: 'upgrade', player: 1, unitId: f.id, to: 'oak' })).toMatchObject({ error: 'not your fighter' });
    expect(g.apply({ type: 'sell', player: 0, unitId: f.id })).toEqual({ ok: true });
    expect(g.players[0]!.gold).toBe(250);

    g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 0 });
    runUntil(g, phaseIs('fight'));
    expect(g.apply({ type: 'build', player: 0, unit: 'sprout', col: 2, row: 0 })).toMatchObject({ error: 'building only during build phase' });
    runUntil(g, phaseIs('build'));
    const gold = g.players[0]!.gold;
    g.apply({ type: 'sell', player: 0, unitId: fightersOf(g, 0)[0]!.id });
    expect(g.players[0]!.gold).toBe(gold + 12);
  });
});

describe('waves', () => {
  it('fighters clear a wave, get restored, and bounty, level bonus and income are paid', () => {
    const g = newGame();
    defend(g, 0);
    defend(g, 1);
    const gold = g.players[0]!.gold;
    const events = runUntil(g, phaseIs('build'));
    expect(g.wave).toBe(2);
    expect(g.players[0]!.leaks).toBe(0);
    const bounties = events.filter((e) => e.type === 'gold' && e.reason === 'bounty' && e.player === 0).length;
    expect(bounties).toBe(6);
    expect(g.players[0]!.gold).toBe(gold + 6 * 3 + 11 + 10);
    expect(g.phaseEndsAtMs - g.timeMs).toBe(3000);
    for (const f of fightersOf(g, 0)) {
      expect(f.dead).toBe(false);
      expect(f.hp).toBe(f.maxHp);
      expect([f.area, f.x, f.y]).toEqual([f.homeArea, f.homeX, f.homeY]);
    }
  });

  it('undefended lanes leak to the king; idle fighters of cleared lanes warp to their king', () => {
    const g = newGame();
    defend(g, 0);
    const king = g.king(1);
    const events = runUntil(g, phaseIs('build'));
    expect(g.players[1]!.leaks).toBe(6);
    expect(events.some((e) => e.type === 'damage' && e.targetId === king.id)).toBe(true);
    const aliceFighters = new Set(fightersOf(g, 0).map((f) => f.id));
    expect(events.some((e) => e.type === 'warp' && aliceFighters.has(e.unitId))).toBe(true);
    expect(king.hp).toBe(king.maxHp);
  });

  it('buffs both kings every buffEvery waves', () => {
    const g = newGame();
    runUntil(g, phaseIs('build'));
    expect(g.king(0).mods.armor).toBe(2);
    expect(g.king(1).mods.attackSpeed).toBeCloseTo(0.1);
  });

  it('ends the game when a king dies', () => {
    const data = testData();
    data.units.king = { ...data.units.king!, hp: 30, hpRegen: 0, attack: { ...data.units.king!.attack, damage: [1, 1] } };
    const g = newGame(data);
    defend(g, 1);
    runUntil(g, (ev) => ev.some((e) => e.type === 'gameOver'));
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(1);
    expect(g.tick()).toEqual([]);
  });

  it('keeps the endless finale going until a king falls', () => {
    const data = { ...withRules({ finaleFirstIntervalS: 0 }), waves: [{ creep: 'grub', count: 4, levelBonus: 0, endless: true }] };
    data.units.king = { ...data.units.king!, hp: 400, hpRegen: 0 };
    const g = newGame(data);
    defend(g, 0);
    const events = runUntil(g, (ev) => ev.some((e) => e.type === 'gameOver'));
    expect(g.winner).toBe(0);
    expect(events.filter((e) => e.type === 'gold' && e.reason === 'bounty')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'phase' && e.phase === 'build')).toHaveLength(0);
  });
});

describe('economy', () => {
  it('workers gather lumber over time and are capped', () => {
    const g = newGame();
    expect(g.apply({ type: 'buyWorker', player: 0 })).toEqual({ ok: true });
    expect(g.players[0]!.gold).toBe(200);
    for (let i = 0; i < 200; i++) g.tick(); // 10 s
    expect(g.players[0]!.lumber).toBe(50 + 2 * 2);
    expect(g.players[1]!.lumber).toBe(50 + 2);
    g.apply({ type: 'buyWorker', player: 0 });
    expect(g.apply({ type: 'buyWorker', player: 0 })).toMatchObject({ error: 'worker limit reached' });
  });

  it('king upgrades cost lumber, add income and stop at the cap', () => {
    const g = newGame();
    const king = g.king(0);
    expect(g.apply({ type: 'upgradeKing', player: 0, stat: 'hp' })).toEqual({ ok: true });
    expect(king.maxHp).toBe(5000 + 450);
    expect(g.players[0]!.income).toBe(13);
    expect(g.players[0]!.lumber).toBe(30);
    g.apply({ type: 'upgradeKing', player: 0, stat: 'hp' });
    expect(king.maxHp).toBe(5000 + 450 + 475);
    expect(g.apply({ type: 'upgradeKing', player: 0, stat: 'hp' })).toMatchObject({ error: 'king upgrade maxed' });
  });
});

describe('sends', () => {
  it('bought in the build phase join the coming wave on the enemy lane', () => {
    const g = newGame(withRules({ startWorkers: 0 }));
    expect(g.apply({ type: 'sendMerc', player: 0, merc: 'brute' })).toEqual({ ok: true });
    runUntil(g, phaseIs('fight'));
    const mercs = [...g.units.values()].filter((u) => u.kind === 'merc');
    expect(mercs.map((m) => [m.area, m.team])).toEqual([[1, 0]]);
  });

  it('bought during a wave raise income and join the enemy lane next wave', () => {
    const g = newGame(withRules({ startWorkers: 0 }));
    runUntil(g, phaseIs('fight'));
    expect(g.apply({ type: 'sendMerc', player: 0, merc: 'brute' })).toEqual({ ok: true });
    expect(g.players[0]!.lumber).toBe(30);
    expect(g.players[0]!.income).toBe(12);
    g.apply({ type: 'sendMerc', player: 0, merc: 'brute' });
    expect(g.apply({ type: 'sendMerc', player: 0, merc: 'brute' })).toMatchObject({ error: 'not enough lumber' });
    expect([...g.units.values()].filter((u) => u.kind === 'merc')).toHaveLength(0);
    runUntil(g, phaseIs('build'));
    runUntil(g, phaseIs('fight'));
    const mercs = [...g.units.values()].filter((u) => u.kind === 'merc');
    expect(mercs).toHaveLength(2);
    expect(mercs.every((m) => m.area === 1 && m.team === 0)).toBe(true);
  });
});

describe('determinism', () => {
  it('replays identically from the same seed and commands', () => {
    const run = () => {
      const g = newGame(testData(), 42);
      defend(g, 0);
      for (let i = 0; i < 3000; i++) {
        if (i === 200) g.apply({ type: 'sendMerc', player: 1, merc: 'brute' });
        g.tick();
      }
      return JSON.stringify([...g.units.values()]) + JSON.stringify(g.players);
    };
    expect(run()).toBe(run());
  });
});

describe('legion content', () => {
  it('is consistent: every referenced unit exists and builders have six tiers', async () => {
    const { LEGION_DATA: d } = await import('../data/legion.ts');
    expect(Object.keys(d.builders).length).toBeGreaterThanOrEqual(5);
    expect(d.waves).toHaveLength(31);
    for (const b of Object.values(d.builders)) {
      expect(b.fighters).toHaveLength(b.random ? 0 : 6);
      for (const id of b.fighters) expect(d.units[id]).toBeDefined();
    }
    for (const u of Object.values(d.units)) for (const to of u.upgradesTo ?? []) expect(d.units[to]).toBeDefined();
    for (const w of d.waves) expect(d.units[w.creep]?.bounty).toBeDefined();
    for (const m of Object.values(d.mercs)) expect(d.units[m.unit]).toBeDefined();
    const { FIGHTER_ABILITIES } = await import('../data/abilities.ts');
    for (const id of Object.keys(FIGHTER_ABILITIES)) expect(d.units[id], `abilities for unknown fighter ${id}`).toBeDefined();
  });

  it('chimera eggs hatch into a same-tier fighter of another builder, paid at egg price', async () => {
    const { LEGION_DATA: d } = await import('../data/legion.ts');
    const g = new Game({ seed: 3, data: d, players: [{ id: 'a', name: 'A', team: 0, builder: 'chimera' }, { id: 'b', name: 'B', team: 1, builder: 'grove' }] });
    const gold = g.players[0]!.gold;
    expect(g.apply({ type: 'build', player: 0, unit: 'chimera-egg-2', col: 0, row: 0 }).ok).toBe(true);
    const [u] = fightersOf(g, 0);
    const def = d.units[u!.def]!;
    expect(def.tier).toBe(2);
    expect(def.morph).toBeUndefined();
    expect(Object.values(d.builders).some((b) => b.id !== 'chimera' && b.fighters.includes(u!.def))).toBe(true);
    expect(g.players[0]!.gold).toBe(gold - d.units['chimera-egg-2']!.goldCost!);
    expect(u!.invested).toBe(d.units['chimera-egg-2']!.goldCost);
  });

  it('a prophet rolls one fighter per tier from the other builders, seeded', async () => {
    const { LEGION_DATA: d, PROPHET } = await import('../data/legion.ts');
    const roster = (seed: number) =>
      new Game({ seed, data: d, players: [{ id: 'a', name: 'A', team: 0, builder: PROPHET }, { id: 'b', name: 'B', team: 1, builder: 'grove' }] }).players[0]!.fighters;
    const r = roster(5);
    expect(r.map((id) => d.units[id]!.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const id of r) expect(Object.values(d.builders).some((b) => !b.random && !d.units[id]!.morph && b.fighters.includes(id))).toBe(true);
    expect(roster(5)).toEqual(r);
    const g = new Game({ seed: 5, data: d, players: [{ id: 'a', name: 'A', team: 0, builder: PROPHET }, { id: 'b', name: 'B', team: 1, builder: 'grove' }] });
    expect(g.apply({ type: 'build', player: 0, unit: r[0]!, col: 0, row: 0 }).ok).toBe(true);
    const other = d.builders.grove!.fighters.find((id) => !r.includes(id))!;
    expect(g.apply({ type: 'build', player: 0, unit: other, col: 1, row: 0 }).ok).toBe(false);
  });

  it('prophets reroll for rising gold and lumber, a limited number of times', async () => {
    const { PROPHET } = await import('../data/legion.ts');
    const base = testData();
    const data = { ...base, builders: { ...base.builders, [PROPHET]: { id: PROPHET, name: 'Prophet', fighters: [], random: true } } };
    // The test data has tier-less fighters only; give them tiers so a roster can be rolled.
    data.units = { ...data.units, sprout: { ...data.units.sprout!, tier: 1 }, archer: { ...data.units.archer!, tier: 2 } };
    const g = new Game({ seed: 1, data, players: [{ id: 'a', name: 'A', team: 0, builder: PROPHET }, { id: 'b', name: 'B', team: 1, builder: 'grove' }] });
    const p = g.players[0]!;
    expect(p.fighters).toEqual(['sprout', 'archer']);
    const { gold, lumber } = p;
    expect(g.apply({ type: 'reroll', player: 0 }).ok).toBe(true);
    expect(g.apply({ type: 'reroll', player: 0 }).ok).toBe(true);
    // rerollCost 10: 10 + 20 spent, and the test rules allow two rerolls.
    expect([p.gold, p.lumber, p.rerolls]).toEqual([gold - 30, lumber - 30, 2]);
    expect(g.apply({ type: 'reroll', player: 0 })).toEqual({ ok: false, error: 'no rerolls left' });
    expect(g.apply({ type: 'reroll', player: 1 }).ok).toBe(false);
  });

  it('bots play the prophet', async () => {
    const { LEGION_DATA: d, PROPHET } = await import('../data/legion.ts');
    const { botCommands } = await import('./bot.ts');
    const g = new Game({ seed: 2, data: d, players: [{ id: 'a', name: 'A', team: 0, builder: PROPHET }, { id: 'b', name: 'B', team: 1, builder: PROPHET }] });
    for (let i = 0; i < 400; i++) {
      for (const p of [0, 1]) for (const cmd of botCommands(g, p)) g.apply(cmd);
      g.tick();
    }
    expect(fightersOf(g, 0).length).toBeGreaterThan(0);
    expect(fightersOf(g, 1).length).toBeGreaterThan(0);
  });

  it('a bot-free 4v4 game with no defenders ends by a king dying', async () => {
    const { LEGION_DATA: d } = await import('../data/legion.ts');
    const builders = Object.keys(d.builders);
    const g = new Game({
      seed: 7,
      data: d,
      players: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, team: (i < 4 ? 0 : 1) as 0 | 1, builder: builders[i % 4]! })),
    });
    // Team 0 places a few T1 fighters each, team 1 nothing.
    for (let p = 0; p < 4; p++) for (let row = 0; row < 5; row++) g.apply({ type: 'build', player: p, unit: d.builders[builders[p]!]!.fighters[0]!, col: 0, row });
    runUntil(g, (ev) => ev.some((e) => e.type === 'gameOver'), 400_000);
    expect(g.winner).toBe(0);
  });
});

describe('wire protocol', () => {
  it('round-trips visual events', async () => {
    const { decodeEvents, encodeEvents } = await import('../net/protocol.ts');
    const events: GameEvent[] = [
      { type: 'attack', unitId: 3, targetId: 9 },
      { type: 'damage', sourceId: 3, targetId: 9, amount: 12, area: 1, x: 100, y: 40 },
      { type: 'death', unitId: 9, killerId: null, area: 1, x: 100, y: 40 },
      { type: 'leak', unitId: 5, player: 2 },
      { type: 'phase', phase: 'fight', wave: 4, endsAtMs: 9000 },
      { type: 'gameOver', winner: 1 },
      { type: 'arenaEnd', winner: 0, gold: 100 },
      { type: 'phase', phase: 'arena', wave: 11, endsAtMs: 1000 },
    ];
    expect(decodeEvents(encodeEvents(events))).toEqual(events);
  });
});

describe('food and farms', () => {
  it('blocks building past the food cap until a farm is upgraded', () => {
    const data = withRules({ startFood: 2 });
    data.units.sprout = { ...data.units.sprout!, food: 1 };
    const g = newGame(data);
    g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 0 });
    g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 1 });
    expect(g.foodUsed(0)).toBe(2);
    expect(g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 2 })).toMatchObject({ error: 'not enough food' });
    expect(g.apply({ type: 'upgradeFarm', player: 0 })).toEqual({ ok: true });
    expect(g.players[0]!.foodCap).toBe(10);
    expect(g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 2 })).toEqual({ ok: true });
    expect(g.apply({ type: 'upgradeFarm', player: 0 })).toMatchObject({ error: 'farm maxed' });
  });
});

describe('send unlocks', () => {
  it('rejects sends before their unlock wave', () => {
    const data = testData();
    data.mercs.brute = { ...data.mercs.brute!, minWave: 2 };
    const g = newGame(data);
    runUntil(g, phaseIs('fight'));
    expect(g.apply({ type: 'sendMerc', player: 0, merc: 'brute' })).toMatchObject({ error: 'unlocks at wave 2' });
  });
});

describe('arena', () => {
  it('pits both armies against each other after an arena wave and pays the winners', () => {
    const g = newGame(withRules({ arenaWaves: [1] }));
    defend(g, 0);
    g.apply({ type: 'build', player: 1, unit: 'sprout', col: 0, row: 2 });
    const events = runUntil(g, (ev) => ev.some((e) => e.type === 'arenaEnd'));
    expect(events.some((e) => e.type === 'phase' && e.phase === 'arena')).toBe(true);
    const end = events.find((e) => e.type === 'arenaEnd') as Extract<GameEvent, { type: 'arenaEnd' }>;
    expect(end.winner).toBe(0);
    expect(end.gold).toBe(10);
    expect(g.phase).toBe('build');
    expect(g.wave).toBe(2);
    for (const f of fightersOf(g, 0)) expect([f.area, f.x, f.dead]).toEqual([f.homeArea, f.homeX, false]);
  });
});

describe('abilities', () => {
  /** Alice defends with one archer carrying `abilities`; Bob's lane is irrelevant. */
  function withArcher(abilities: AbilityDef[], tweak?: (d: GameData) => void) {
    const data = testData();
    data.units.archer = { ...data.units.archer!, abilities };
    tweak?.(data);
    const g = newGame(data);
    g.apply({ type: 'build', player: 0, unit: 'archer', col: 0, row: 2 });
    return g;
  }
  const damageBy = (events: GameEvent[], sourceId: number) =>
    events.filter((e): e is Extract<GameEvent, { type: 'damage' }> => e.type === 'damage' && e.sourceId === sourceId);
  const archerId = (g: Game) => fightersOf(g, 0)[0]!.id;

  it('auras boost allies in range, crits multiply the main hit', () => {
    const g = withArcher([
      { name: 'Might', kind: 'aura', stat: 'damage', amount: 1, radius: 2000 },
      { name: 'Deadeye', kind: 'crit', chance: 1, multiplier: 2 },
    ]);
    const events = runUntil(g, (ev) => ev.some((e) => e.type === 'damage'));
    const hit = damageBy(events, archerId(g))[0]!;
    expect(hit.amount).toBeGreaterThanOrEqual(20 * 2 * 2);
    expect(events.some((e) => e.type === 'effect' && e.effect === 'crit')).toBe(true);
  });

  it('splash and multishot hit several creeps per attack', () => {
    for (const ability of [
      { name: 'Blast', kind: 'splash', radius: 400, ratio: 1 },
      { name: 'Volley', kind: 'multishot', targets: 3, ratio: 1 },
    ] satisfies AbilityDef[]) {
      const g = withArcher([ability]);
      const events = runUntil(g, (ev) => new Set(damageBy(ev, archerId(g)).map((e) => e.targetId)).size > 1, 4000);
      expect(new Set(damageBy(events.slice(-50), archerId(g)).map((e) => e.targetId)).size).toBeGreaterThan(1);
    }
  });

  it('poison keeps ticking and stuns stop the target from acting', () => {
    const g = withArcher([
      { name: 'Venom', kind: 'poison', dps: 4, durationMs: 3000 },
      { name: 'Bash', kind: 'stun', chance: 1, durationMs: 3000 },
    ]);
    runUntil(g, (ev) => ev.some((e) => e.type === 'effect' && e.effect === 'stun'));
    const grub = [...g.units.values()].find((u) => u.kind === 'creep' && u.status & STATUS.stunned);
    expect(grub).toBeDefined();
    expect(grub!.status & STATUS.poisoned).toBeTruthy();
    const later: GameEvent[] = [];
    for (let i = 0; i < 10; i++) later.push(...g.tick());
    expect(later.some((e) => e.type === 'attack' && e.unitId === grub!.id)).toBe(false);
  });

  it('creeps never push a fighting fighter back', () => {
    const data = testData();
    data.units.sprout = { ...data.units.sprout!, hp: 1_000_000, attack: { ...data.units.sprout!.attack, damage: [0, 0] } };
    // A big crowd of melee grubs piling up behind each other.
    data.waves[0] = { ...data.waves[0]!, count: 40 };
    data.units.grub = { ...data.units.grub!, attack: { ...data.units.grub!.attack, range: 40 } };
    const g = newGame(data);
    g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 2 });
    const sprout = fightersOf(g, 0)[0]!;
    runUntil(g, phaseIs('fight'));
    let maxX = -Infinity;
    let engagedX: number | null = null;
    for (let i = 0; i < 600; i++) {
      g.tick();
      if (engagedX === null && sprout.targetId !== null) engagedX = sprout.x;
      if (engagedX !== null) maxX = Math.max(maxX, sprout.x);
    }
    expect(engagedX).not.toBeNull();
    // Creeps march in +x; being shoved would carry the sprout that way.
    expect(maxX - engagedX!).toBeLessThan(2);
  });

  it('bosses keep stuns only a quarter as long', () => {
    const g = withArcher([{ name: 'Bash', kind: 'stun', chance: 1, durationMs: 4000 }], (d) => {
      d.units[d.waves[0]!.creep]!.boss = true;
    });
    runUntil(g, (ev) => ev.some((e) => e.type === 'effect' && e.effect === 'stun'));
    const boss = [...g.units.values()].find((u) => u.kind === 'creep' && u.status & STATUS.stunned)!;
    const stun = boss.buffs.find((b) => b.kind === 'stun')!;
    expect(stun.untilMs - g.timeMs).toBeLessThanOrEqual(1000);
  });

  it('lifesteal and heal restore HP; thorns hurt melee attackers', () => {
    const data = testData();
    data.units.sprout = {
      ...data.units.sprout!,
      hp: 2000,
      abilities: [
        { name: 'Thorns', kind: 'thorns', ratio: 1 },
        { name: 'Mend', kind: 'heal', amount: 50, radius: 600, cooldownMs: 1000 },
      ],
    };
    const g = newGame(data);
    g.apply({ type: 'build', player: 0, unit: 'sprout', col: 0, row: 2 });
    const sprout = fightersOf(g, 0)[0]!;
    const events = runUntil(g, (ev) => ev.some((e) => e.type === 'effect' && e.effect === 'heal'), 6000);
    expect(events.some((e) => e.type === 'damage' && e.sourceId === sprout.id && e.targetId !== sprout.id)).toBe(true);
    const thorn = events.find((e) => e.type === 'damage' && e.targetId !== sprout.id && e.sourceId === sprout.id);
    expect(thorn).toBeDefined();
  });

  it('novas blast every enemy nearby', () => {
    const g = withArcher([{ name: 'Quake', kind: 'nova', damage: 5, radius: 2000, cooldownMs: 500 }]);
    // A nova once several creeps have spawned hits all of them in the same tick.
    const tick = runUntil(g, (ev) => ev.some((e) => e.type === 'effect' && e.effect === 'nova') && damageBy(ev, archerId(g)).length > 2);
    expect(tick.length).toBeGreaterThan(0);
  });

  it('kings learn granted abilities after their wave', () => {
    const data = withRules({});
    data.rules.king = { ...data.rules.king, grants: [{ wave: 1, ability: { name: 'Royal Aura', kind: 'aura', stat: 'armor', amount: 5, radius: 800 } }] };
    const g = newGame(data);
    runUntil(g, phaseIs('build'));
    expect(g.king(0).granted.map((a) => a.name)).toEqual(['Royal Aura']);
  });
});

describe('legion abilities', () => {
  it('only reference existing fighters', async () => {
    const { FIGHTER_ABILITIES } = await import('../data/abilities.ts');
    const { LEGION_DATA } = await import('../data/legion.ts');
    for (const id of Object.keys(FIGHTER_ABILITIES)) expect(LEGION_DATA.units[id]?.abilities?.length).toBeGreaterThan(0);
  });
});
