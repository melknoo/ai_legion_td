import { computeDamage } from './damage.ts';
import { ARENA, CELL, LANE, cellCenter, isValidCell } from './geometry.ts';
import { Rng } from './rng.ts';
import { MELEE_RANGE, type GameData, type KingStat, type Phase, type TeamId, type UnitDef, type UnitKind } from './types.ts';
import type { GameView } from './view.ts';
import { STATUS, type AbilityDef, type AuraStat, type Buff, type BuffKind, type EffectKind } from './abilities.ts';

export const TICK_MS = 50;

export interface PlayerConfig {
  id: string;
  name: string;
  team: TeamId;
  builder: string;
}

export interface GameConfig {
  players: PlayerConfig[];
  seed: number;
  data: GameData;
}

export interface PlayerState {
  index: number;
  id: string;
  name: string;
  team: TeamId;
  builder: string;
  /** Fighters this player can build: the builder's, or a Prophet's rolled roster. */
  fighters: string[];
  /** Prophet rerolls used. */
  rerolls: number;
  /** Merc ids this player bought that wait for the next wave start. */
  queuedSends: string[];
  gold: number;
  lumber: number;
  income: number;
  workers: number;
  leaks: number;
  foodCap: number;
  /** Farm upgrades bought so far. */
  farmLevel: number;
}

/** Additive stat modifiers on top of the unit definition (king upgrades, later buffs). */
export interface UnitMods {
  hp: number;
  damage: number;
  regen: number;
  armor: number;
  /** Attack speed bonus as a fraction (0.1 = +10 %). */
  attackSpeed: number;
}

export interface UnitState {
  id: number;
  def: string;
  kind: UnitKind;
  /** Owning player index; -1 for wave creeps, sends and kings. */
  owner: number;
  team: TeamId;
  /** Lane index (= player index) or king arena (players.length + team). */
  area: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldownMs: number;
  targetId: number | null;
  dead: boolean;
  mods: UnitMods;
  /** Fighters only: build slot, return point and gold put in (for sell refunds). */
  cell?: { col: number; row: number };
  homeArea: number;
  homeX: number;
  homeY: number;
  invested: number;
  /** Placed in the current build phase: sells for a full refund. */
  fresh: boolean;
  /** Creeps that reached the king. */
  leaked: boolean;
  /** Timed debuffs from abilities. */
  buffs: Buff[];
  /** When each of the unit's cooldown abilities is ready again (by ability index). */
  readyAt: number[];
  /** Abilities gained during the game (kings). */
  granted: AbilityDef[];
  /** STATUS bit flags of active debuffs. */
  status: number;
}

export type Command =
  | { type: 'build'; player: number; unit: string; col: number; row: number }
  | { type: 'upgrade'; player: number; unitId: number; to: string }
  | { type: 'sell'; player: number; unitId: number }
  | { type: 'sendMerc'; player: number; merc: string }
  | { type: 'buyWorker'; player: number }
  | { type: 'upgradeFarm'; player: number }
  | { type: 'upgradeKing'; player: number; stat: KingStat }
  | { type: 'reroll'; player: number };

export type GameEvent =
  | { type: 'phase'; phase: Phase; wave: number; endsAtMs: number }
  | { type: 'spawn'; unitId: number }
  | { type: 'remove'; unitId: number }
  /** x/y: the target's position, since a killing blow removes the target before clients see the event. */
  | { type: 'attack'; unitId: number; targetId: number; x: number; y: number }
  // Damage and death carry the position so clients can show effects even if the unit is already gone.
  | { type: 'damage'; sourceId: number; targetId: number; amount: number; area: number; x: number; y: number }
  | { type: 'death'; unitId: number; killerId: number | null; area: number; x: number; y: number }
  | { type: 'leak'; unitId: number; player: number }
  | { type: 'warp'; unitId: number }
  | { type: 'gold'; player: number; amount: number; reason: 'bounty' | 'income' | 'bonus' | 'refund' }
  | { type: 'kingUpgrade'; team: TeamId; stat: KingStat; level: number }
  | { type: 'arenaEnd'; winner: TeamId | null; gold: number }
  | { type: 'effect'; effect: EffectKind; unitId: number; area: number; x: number; y: number; amount: number }
  | { type: 'gameOver'; winner: TeamId | null };

export type CommandResult = { ok: true } | { ok: false; error: string };

const NO_MODS: UnitMods = { hp: 0, damage: 0, regen: 0, armor: 0, attackSpeed: 0 };
const NO_AURA: Record<AuraStat, number> = { damage: 0, armor: 0, attackSpeed: 0, regen: 0 };
/** Poison deals its damage in steps of this length. */
/** Bosses keep stuns and slows only this long (the original: "reduced greatly on bosses"). */
const BOSS_CC_FACTOR = 0.25;
const POISON_STEP_MS = 500;

export class Game implements GameView {
  readonly data: GameData;
  readonly players: PlayerState[];
  readonly units = new Map<number, UnitState>();
  phase: Phase = 'build';
  /** Number of the wave currently fought or prepared (1-based). */
  wave = 1;
  timeMs = 0;
  phaseEndsAtMs: number;
  winner: TeamId | null = null;
  readonly kingLevels: Record<TeamId, Record<KingStat, number>> = {
    0: { hp: 0, attack: 0, regen: 0 },
    1: { hp: 0, attack: 0, regen: 0 },
  };

  private readonly rng: Rng;
  /** Units that stood in range of their target this tick; enemies can't push them. */
  private readonly engaged = new Set<number>();
  private nextUnitId = 1;
  private events: GameEvent[] = [];
  /** Sends bought by each team, released onto the enemy lanes at the next wave start. */
  private pendingSends: Record<TeamId, string[]> = { 0: [], 1: [] };
  /** Creeps still to spawn per lane in the running wave. */
  private spawnQueue: number[];
  private nextSpawnMs = 0;
  private lumberTickMs = 0;
  private finaleGapS = 0;
  private nextFinaleBatchMs = 0;
  /** Aura bonuses per unit, recomputed every fight tick. */
  private readonly auras = new Map<number, Record<AuraStat, number>>();

  constructor(config: GameConfig) {
    this.data = config.data;
    this.rng = new Rng(config.seed);
    const r = this.data.rules;
    this.players = config.players.map((p, index) => ({
      index,
      ...p,
      fighters: this.data.builders[p.builder]?.random ? this.rollRoster() : [...(this.data.builders[p.builder]?.fighters ?? [])],
      rerolls: 0,
      queuedSends: [],
      gold: r.startGold,
      lumber: r.startLumber,
      income: r.startIncome,
      workers: r.startWorkers,
      leaks: 0,
      foodCap: r.startFood,
      farmLevel: 0,
    }));
    this.spawnQueue = this.players.map(() => 0);
    this.phaseEndsAtMs = r.firstBuildMs;
    for (const team of [0, 1] as const) {
      this.spawn(r.king.unit, 'king', -1, team, this.arenaOf(team), ARENA.kingX, ARENA.kingY);
    }
  }

  // ---- public API -------------------------------------------------------

  apply(cmd: Command): CommandResult {
    if (this.phase === 'over') return fail('game over');
    const player = this.players[cmd.player];
    if (!player) return fail('unknown player');
    switch (cmd.type) {
      case 'build':
        return this.build(player, cmd.unit, cmd.col, cmd.row);
      case 'upgrade':
        return this.upgrade(player, cmd.unitId, cmd.to);
      case 'sell':
        return this.sell(player, cmd.unitId);
      case 'sendMerc':
        return this.sendMerc(player, cmd.merc);
      case 'buyWorker':
        return this.buyWorker(player);
      case 'upgradeFarm':
        return this.upgradeFarm(player);
      case 'upgradeKing':
        return this.upgradeKing(player, cmd.stat);
      case 'reroll':
        return this.reroll(player);
    }
  }

  /** Advances the simulation by one fixed step and returns what happened. */
  tick(): GameEvent[] {
    if (this.phase !== 'over') {
      this.timeMs += TICK_MS;
      this.gatherLumber();
      if (this.phase === 'build') {
        if (this.timeMs >= this.phaseEndsAtMs) this.startFight();
      } else if (this.phase === 'arena') {
        this.stepArena();
      } else {
        this.stepFight();
      }
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  def(unit: UnitState): UnitDef {
    const d = this.data.units[unit.def];
    if (!d) throw new Error(`unknown unit def ${unit.def}`);
    return d;
  }

  arenaOf(team: TeamId): number {
    return this.players.length + team;
  }

  isLane(area: number): boolean {
    return area < this.players.length;
  }

  king(team: TeamId): UnitState {
    for (const u of this.units.values()) if (u.kind === 'king' && u.team === team) return u;
    throw new Error(`no king for team ${team}`);
  }

  buildDurationMs(wave: number): number {
    const r = this.data.rules;
    return wave <= 1 ? r.firstBuildMs : r.buildBaseMs + Math.floor(wave / 2) * r.buildPerWaveMs;
  }

  // ---- commands ---------------------------------------------------------

  private build(player: PlayerState, unitId: string, col: number, row: number): CommandResult {
    if (this.phase !== 'build') return fail('building only during build phase');
    if (!player.fighters.includes(unitId)) return fail('unit not available for builder');
    if (!isValidCell(col, row)) return fail('invalid cell');
    for (const u of this.units.values()) {
      if (u.kind === 'fighter' && u.owner === player.index && u.cell?.col === col && u.cell.row === row) return fail('cell occupied');
    }
    const def = this.data.units[unitId];
    const cost = def?.goldCost ?? 0;
    if (player.gold < cost) return fail('not enough gold');
    if (this.foodUsed(player.index) + (def?.food ?? 0) > player.foodCap) return fail('not enough food');
    player.gold -= cost;
    const { x, y } = cellCenter(col, row);
    // A morph hatches into a random fighter of its tier from the other builders.
    const placed = def?.morph ? this.rng.pick(this.morphPool(def.morph)) ?? unitId : unitId;
    const u = this.spawn(placed, 'fighter', player.index, player.team, player.index, x, y);
    u.cell = { col, row };
    u.invested = cost;
    u.fresh = true;
    return { ok: true };
  }

  /** Prophet roster: one random base fighter per tier. */
  private rollRoster(): string[] {
    return [1, 2, 3, 4, 5, 6].flatMap((tier) => this.rng.pick(this.morphPool(tier)) ?? []);
  }

  /** Prophets swap their whole roster for a fresh roll; each reroll costs more than the last. */
  private reroll(player: PlayerState): CommandResult {
    const r = this.data.rules.prophet;
    if (!this.data.builders[player.builder]?.random) return fail('only prophets can reroll');
    if (player.rerolls >= r.rerolls) return fail('no rerolls left');
    const cost = rerollCost(this.data, player);
    if (player.gold < cost) return fail('not enough gold');
    if (player.lumber < cost) return fail('not enough lumber');
    player.gold -= cost;
    player.lumber -= cost;
    player.rerolls++;
    player.fighters = this.rollRoster();
    return { ok: true };
  }

  /** Base fighters of the given tier from every builder that doesn't morph. */
  private morphPool(tier: number): string[] {
    return Object.values(this.data.builders)
      .flatMap((b) => b.fighters)
      .filter((id) => {
        const d = this.data.units[id];
        return d?.tier === tier && !d.morph;
      });
  }

  private upgrade(player: PlayerState, unitId: number, to: string): CommandResult {
    if (this.phase !== 'build') return fail('upgrades only during build phase');
    const u = this.units.get(unitId);
    if (!u || u.kind !== 'fighter' || u.owner !== player.index) return fail('not your fighter');
    if (!this.def(u).upgradesTo?.includes(to)) return fail('invalid upgrade');
    const next = this.data.units[to];
    if (!next) return fail('unknown unit');
    const cost = next.goldCost ?? 0;
    if (player.gold < cost) return fail('not enough gold');
    const extraFood = (next.food ?? 0) - (this.def(u).food ?? 0);
    if (extraFood > 0 && this.foodUsed(player.index) + extraFood > player.foodCap) return fail('not enough food');
    player.gold -= cost;
    u.def = to;
    u.maxHp = next.hp;
    u.hp = next.hp;
    u.invested += cost;
    this.events.push({ type: 'spawn', unitId: u.id });
    return { ok: true };
  }

  private sell(player: PlayerState, unitId: number): CommandResult {
    if (this.phase !== 'build') return fail('selling only during build phase');
    const u = this.units.get(unitId);
    if (!u || u.kind !== 'fighter' || u.owner !== player.index) return fail('not your fighter');
    const refund = u.fresh ? u.invested : Math.floor(u.invested * this.data.rules.sellRefund);
    player.gold += refund;
    this.events.push({ type: 'gold', player: player.index, amount: refund, reason: 'refund' });
    this.remove(u);
    return { ok: true };
  }

  private sendMerc(player: PlayerState, mercId: string): CommandResult {
    if (this.phase !== 'build' && this.phase !== 'fight') return fail('no sends right now');
    const merc = this.data.mercs[mercId];
    if (!merc) return fail('unknown merc');
    if (this.wave < (merc.minWave ?? 0)) return fail(`unlocks at wave ${merc.minWave}`);
    if (player.lumber < merc.lumberCost) return fail('not enough lumber');
    player.lumber -= merc.lumberCost;
    player.income += merc.incomeGain;
    this.pendingSends[player.team].push(merc.unit);
    player.queuedSends.push(mercId);
    return { ok: true };
  }

  private upgradeFarm(player: PlayerState): CommandResult {
    const r = this.data.rules;
    const farm = r.farms[player.farmLevel];
    if (!farm || player.foodCap >= r.maxFood) return fail('farm maxed');
    if (player.gold < farm.gold) return fail('not enough gold');
    if (player.lumber < farm.lumber) return fail('not enough lumber');
    player.gold -= farm.gold;
    player.lumber -= farm.lumber;
    player.farmLevel++;
    player.foodCap = Math.min(r.maxFood, player.foodCap + farm.food);
    return { ok: true };
  }

  /** Food taken by a player's fighters. */
  foodUsed(player: number): number {
    let food = 0;
    for (const u of this.units.values()) if (u.kind === 'fighter' && u.owner === player) food += this.def(u).food ?? 0;
    return food;
  }

  private buyWorker(player: PlayerState): CommandResult {
    const r = this.data.rules;
    if (player.workers >= r.maxWorkers) return fail('worker limit reached');
    if (player.gold < r.workerCost) return fail('not enough gold');
    player.gold -= r.workerCost;
    player.workers++;
    return { ok: true };
  }

  private upgradeKing(player: PlayerState, stat: KingStat): CommandResult {
    const k = this.data.rules.king;
    const levels = this.kingLevels[player.team];
    const max = stat === 'hp' ? k.hpMax : stat === 'attack' ? k.attackMax : k.regenMax;
    if (levels[stat] >= max) return fail('king upgrade maxed');
    if (player.lumber < k.upgradeLumber) return fail('not enough lumber');
    player.lumber -= k.upgradeLumber;
    player.income += k.upgradeIncome;
    const level = ++levels[stat];
    const king = this.king(player.team);
    if (stat === 'hp') {
      const gain = k.hpBase + k.hpStep * level;
      king.mods.hp += gain;
      king.maxHp += gain;
      king.hp += gain;
    } else if (stat === 'attack') {
      king.mods.damage += k.attackStep;
    } else {
      king.mods.regen += k.regenStep;
    }
    this.events.push({ type: 'kingUpgrade', team: player.team, stat, level });
    return { ok: true };
  }

  // ---- phases -----------------------------------------------------------

  private startFight(): void {
    const wave = this.data.waves[this.wave - 1];
    if (!wave) return this.finish();
    this.phase = 'fight';
    this.phaseEndsAtMs = this.timeMs + this.data.rules.maxFightMs;
    for (const u of this.units.values()) u.fresh = false;
    this.spawnQueue = this.players.map(() => wave.count);
    this.nextSpawnMs = this.timeMs;
    if (wave.endless) {
      this.finaleGapS = this.data.rules.finaleFirstIntervalS;
      this.nextFinaleBatchMs = this.timeMs + this.nextFinaleGapMs();
    }
    this.releaseSends();
    this.events.push({ type: 'phase', phase: 'fight', wave: this.wave, endsAtMs: this.phaseEndsAtMs });
  }

  /** Each team's queued sends go round-robin onto the enemy lanes, starting at a random lane. */
  private releaseSends(): void {
    for (const team of [0, 1] as const) {
      const lanes = this.players.filter((p) => p.team !== team);
      const sends = this.pendingSends[team];
      if (!lanes.length || !sends.length) continue;
      let i = this.rng.int(0, lanes.length - 1);
      for (const unit of sends) this.spawnAttacker(unit, 'merc', lanes[i++ % lanes.length]!);
      this.pendingSends[team] = [];
    }
    for (const p of this.players) p.queuedSends = [];
  }

  private endFight(): void {
    const r = this.data.rules;
    for (const u of [...this.units.values()]) {
      if (u.kind === 'creep' || u.kind === 'merc') this.remove(u);
    }
    this.restoreUnits();
    const bonus = this.data.waves[this.wave - 1]?.levelBonus ?? 0;
    for (const p of this.players) {
      p.gold += bonus + p.income;
      this.events.push({ type: 'gold', player: p.index, amount: bonus, reason: 'bonus' });
      this.events.push({ type: 'gold', player: p.index, amount: p.income, reason: 'income' });
    }
    if (this.wave % r.king.buffEvery === 0) {
      for (const team of [0, 1] as const) {
        const king = this.king(team);
        king.mods.armor += r.king.buffArmor;
        king.mods.attackSpeed += r.king.buffAttackSpeed;
      }
    }
    for (const grant of r.king.grants ?? []) {
      if (grant.wave === this.wave) for (const team of [0, 1] as const) this.king(team).granted.push(grant.ability);
    }
    const arena = r.arenaWaves.includes(this.wave);
    this.wave++;
    if (this.wave > this.data.waves.length) return this.finish();
    if (arena) return this.startArena();
    this.startBuild();
  }

  private startBuild(): void {
    this.phase = 'build';
    this.phaseEndsAtMs = this.timeMs + this.buildDurationMs(this.wave);
    this.events.push({ type: 'phase', phase: 'build', wave: this.wave, endsAtMs: this.phaseEndsAtMs });
  }

  /** Fighters and kings come back unharmed and in place. */
  private restoreUnits(): void {
    for (const u of this.units.values()) {
      u.dead = false;
      u.hp = u.maxHp;
      u.area = u.homeArea;
      u.x = u.homeX;
      u.y = u.homeY;
      u.cooldownMs = 0;
      u.targetId = null;
      u.buffs = [];
      u.readyAt = [];
      u.status = 0;
    }
  }

  // ---- arena ------------------------------------------------------------

  /** Area where both teams' armies meet after the arena waves. */
  battleArena(): number {
    return this.players.length + 2;
  }

  /** Every fighter enters the arena: west lines up on the left, east on the right, mirroring their grids. */
  private startArena(): void {
    this.phase = 'arena';
    this.phaseEndsAtMs = this.timeMs + this.data.rules.arenaMaxMs;
    const area = this.battleArena();
    for (const u of this.units.values()) {
      if (u.kind !== 'fighter' || !u.cell) continue;
      const depth = 96 + (LANE.gridCols - 1 - u.cell.col) * 40 + this.rng.range(0, 16);
      u.area = area;
      u.x = u.team === 0 ? depth : ARENA.width - depth;
      u.y = Math.min(ARENA.height - 16, u.cell.row * CELL + CELL / 2 + this.rng.range(-8, 8));
      u.targetId = null;
    }
    this.events.push({ type: 'phase', phase: 'arena', wave: this.wave, endsAtMs: this.phaseEndsAtMs });
  }

  private stepArena(): void {
    const dt = TICK_MS / 1000;
    const area = this.battleArena();
    this.computeAuras();
    for (const u of [...this.units.values()]) {
      if (u.dead || u.area !== area) continue;
      u.cooldownMs = Math.max(0, u.cooldownMs - TICK_MS);
      this.tickBuffs(u);
      if (u.dead || this.isStunned(u)) continue;
      this.act(u, this.def(u), dt);
    }
    this.separate();
    const alive = [0, 1].map((t) => [...this.units.values()].some((u) => u.area === area && !u.dead && u.team === t));
    if (alive[0] && alive[1] && this.timeMs < this.phaseEndsAtMs) return;
    const winner: TeamId | null = alive[0] === alive[1] ? null : alive[0] ? 0 : 1;
    // The arena follows the wave that was just cleared.
    const wave = this.wave - 1;
    const full = wave * this.data.rules.arenaGoldPerWave;
    const gold = winner === null ? Math.floor(full / 2) : full;
    for (const p of this.players) {
      if (winner !== null && p.team !== winner) continue;
      p.gold += gold;
      this.events.push({ type: 'gold', player: p.index, amount: gold, reason: 'bonus' });
    }
    this.events.push({ type: 'arenaEnd', winner, gold });
    this.restoreUnits();
    this.startBuild();
  }

  /** Out of waves: the team whose king has more HP left wins. */
  private finish(): void {
    const a = this.king(0);
    const b = this.king(1);
    const ra = a.hp / a.maxHp;
    const rb = b.hp / b.maxHp;
    this.gameOver(ra === rb ? null : ra > rb ? 0 : 1);
  }

  private gameOver(winner: TeamId | null): void {
    this.phase = 'over';
    this.winner = winner;
    this.events.push({ type: 'gameOver', winner });
  }

  // ---- economy ------------------------------------------------------------

  private gatherLumber(): void {
    const r = this.data.rules;
    this.lumberTickMs += TICK_MS;
    if (this.lumberTickMs < r.lumberIntervalMs) return;
    this.lumberTickMs -= r.lumberIntervalMs;
    for (const p of this.players) p.lumber += p.workers * r.lumberPerWorker;
  }

  // ---- fight simulation -------------------------------------------------

  private stepFight(): void {
    const dt = TICK_MS / 1000;
    this.spawnWave();
    this.computeAuras();
    for (const u of [...this.units.values()]) {
      if (u.dead) continue;
      const def = this.def(u);
      const regen = (def.hpRegen ?? 0) + u.mods.regen + this.aura(u).regen;
      if (regen) u.hp = Math.min(u.maxHp, u.hp + regen * dt);
      u.cooldownMs = Math.max(0, u.cooldownMs - TICK_MS);
      this.tickBuffs(u);
      if (u.dead || this.isStunned(u)) continue;
      if (this.isLane(u.area) && u.x >= LANE.leakX && u.kind !== 'king') {
        if (this.isAttacker(u)) this.leak(u);
        else this.warpToKing(u);
        continue;
      }
      this.act(u, def, dt);
      if (this.phase === 'over') return;
    }
    this.separate();
    const wave = this.data.waves[this.wave - 1];
    if (wave?.endless) return;
    const pending = this.spawnQueue.some((n) => n > 0);
    const safetyCap = this.timeMs >= this.phaseEndsAtMs;
    if (safetyCap || (!pending && ![...this.units.values()].some((u) => this.isAttacker(u)))) this.endFight();
  }

  /** Creeps trickle in one per lane per spawn interval; the finale adds batches on a shrinking timer. */
  private spawnWave(): void {
    const wave = this.data.waves[this.wave - 1];
    if (!wave) return;
    if (wave.endless && this.timeMs >= this.nextFinaleBatchMs) {
      this.spawnQueue = this.players.map((_, i) => this.spawnQueue[i]! + wave.count);
      this.nextFinaleBatchMs = this.timeMs + this.nextFinaleGapMs();
    }
    if (this.timeMs < this.nextSpawnMs) return;
    this.nextSpawnMs = this.timeMs + this.data.rules.spawnIntervalMs;
    for (const p of this.players) {
      if (this.spawnQueue[p.index]! <= 0) continue;
      this.spawnQueue[p.index]!--;
      this.spawnAttacker(wave.creep, 'creep', p);
    }
  }

  private nextFinaleGapMs(): number {
    this.finaleGapS = (this.finaleGapS * 5) / 6;
    return (this.finaleGapS + 10) * 1000;
  }

  private act(u: UnitState, def: UnitDef, dt: number): void {
    this.useActives(u);
    const slow = this.slowOf(u);
    const step = def.moveSpeed * (1 - slow) * dt;
    const target = this.acquireTarget(u);
    if (!target) {
      if (this.isAttacker(u)) {
        // March on: to the leak line in a lane, to the king in the arena.
        const inLane = this.isLane(u.area);
        this.moveTowards(u, inLane ? LANE.leakX + 1 : ARENA.kingX, inLane ? u.y : ARENA.kingY, step);
      } else if (u.kind === 'fighter' && this.isLane(u.area) && !this.laneHasAttackers(u.area)) {
        // Lane cleared: head for the lane end and help defend the king.
        this.moveTowards(u, LANE.leakX + 1, u.y, step);
      }
      return;
    }
    u.targetId = target.id;
    const reach = def.attack.range + def.radius + this.def(target).radius;
    const dist = Math.hypot(target.x - u.x, target.y - u.y);
    if (dist > reach) {
      this.moveTowards(u, target.x, target.y, Math.min(step, dist - reach));
      return;
    }
    this.engaged.add(u.id);
    if (u.cooldownMs > 0) return;
    const speed = 1 + u.mods.attackSpeed + this.aura(u).attackSpeed - slow;
    u.cooldownMs = def.attack.cooldownMs / Math.max(0.2, speed);
    this.events.push({ type: 'attack', unitId: u.id, targetId: target.id, x: target.x, y: target.y });
    this.hit(u, target);
    // Multishot: extra enemies within reach take a weaker hit.
    for (const a of this.abilitiesOf(u)) {
      if (a.kind !== 'multishot') continue;
      const extra = [...this.units.values()]
        .filter((o) => o !== target && !o.dead && o.area === u.area && o.team !== u.team)
        .map((o) => ({ o, d: Math.hypot(o.x - u.x, o.y - u.y) - this.def(o).radius }))
        .filter(({ d }) => d <= def.attack.range + def.radius)
        .sort((p, q) => p.d - q.d)
        .slice(0, a.targets);
      for (const { o } of extra) {
        this.events.push({ type: 'attack', unitId: u.id, targetId: o.id, x: o.x, y: o.y });
        this.hit(u, o, a.ratio, false);
      }
    }
  }

  private acquireTarget(u: UnitState): UnitState | null {
    const current = u.targetId !== null ? this.units.get(u.targetId) : undefined;
    if (current && !current.dead && current.area === u.area && current.team !== u.team) return current;
    const maxDist = this.isAttacker(u) ? this.data.rules.creepAggroRange : u.kind === 'king' ? this.def(u).attack.range : Infinity;
    let best: UnitState | null = null;
    let bestDist = maxDist;
    for (const other of this.units.values()) {
      if (other.dead || other.area !== u.area || other.team === u.team) continue;
      const d = Math.hypot(other.x - u.x, other.y - u.y);
      if (d < bestDist) {
        best = other;
        bestDist = d;
      }
    }
    return best;
  }

  /** One attack landing: crits on the main hit, then on-hit abilities and the target's thorns. */
  private hit(source: UnitState, target: UnitState, ratio = 1, primary = true): void {
    const sd = this.def(source);
    const abilities = this.abilitiesOf(source);
    let raw = (this.rng.int(sd.attack.damage[0], sd.attack.damage[1]) + source.mods.damage) * (1 + this.aura(source).damage) * ratio;
    let crit = false;
    for (const a of abilities) {
      if (primary && a.kind === 'crit' && this.rng.next() < a.chance) {
        raw *= a.multiplier;
        crit = true;
        break;
      }
    }
    const at = { area: target.area, x: target.x, y: target.y };
    const amount = this.mitigate(raw, source, target);
    this.dealDamage(source, target, amount);
    if (crit) this.effect('crit', target.id, at, amount);
    if (primary) {
      for (const a of abilities) {
        switch (a.kind) {
          case 'splash': {
            for (const o of [...this.units.values()]) {
              if (o === target || o.dead || o.area !== at.area || o.team === source.team) continue;
              if (Math.hypot(o.x - at.x, o.y - at.y) <= a.radius) this.dealDamage(source, o, this.mitigate(raw * a.ratio, source, o));
            }
            this.effect('splash', target.id, at, 0);
            break;
          }
          case 'lifesteal':
            if (!source.dead) source.hp = Math.min(source.maxHp, source.hp + amount * a.ratio);
            break;
          case 'poison':
            this.addBuff(target, 'poison', a.dps, a.durationMs, source.id);
            break;
          case 'slow':
            this.addBuff(target, 'slow', a.amount, a.durationMs, source.id);
            break;
          case 'armorBreak':
            this.addBuff(target, 'armorBreak', a.amount, a.durationMs, source.id);
            break;
          case 'stun':
            if (!target.dead && this.rng.next() < a.chance) {
              this.addBuff(target, 'stun', 1, a.durationMs, source.id);
              this.effect('stun', target.id, at, 0);
            }
            break;
        }
      }
    }
    // Thorns punish melee attackers.
    if (sd.attack.range <= MELEE_RANGE && !source.dead) {
      for (const a of this.abilitiesOf(target)) if (a.kind === 'thorns') this.dealDamage(target, source, amount * a.ratio);
    }
  }

  /** Attack type, armor type and armor (with auras and armor breaks) applied to raw damage. */
  private mitigate(raw: number, source: UnitState, target: UnitState): number {
    const td = this.def(target);
    const r = this.data.rules;
    return computeDamage(raw, this.def(source).attack.type, td.armorType, this.effectiveArmor(target), this.data.damageTable, r.armorFactor);
  }

  private dealDamage(source: UnitState | null, target: UnitState, amount: number): void {
    if (target.dead || amount <= 0) return;
    target.hp -= amount;
    this.events.push({ type: 'damage', sourceId: source?.id ?? -1, targetId: target.id, amount, area: target.area, x: target.x, y: target.y });
    if (target.hp <= 0) this.kill(target, source);
  }

  // ---- abilities --------------------------------------------------------

  abilitiesOf(u: UnitState): AbilityDef[] {
    const own = this.def(u).abilities;
    return u.granted.length ? [...(own ?? []), ...u.granted] : (own ?? []);
  }

  private aura(u: UnitState): Record<AuraStat, number> {
    return this.auras.get(u.id) ?? NO_AURA;
  }

  /** Sums every aura onto the units around its carrier (allies, or enemies for debuff auras). */
  private computeAuras(): void {
    this.auras.clear();
    const all = [...this.units.values()];
    for (const c of all) {
      if (c.dead) continue;
      for (const a of this.abilitiesOf(c)) {
        if (a.kind !== 'aura') continue;
        for (const o of all) {
          if (o.dead || o.area !== c.area || (a.enemies ? o.team === c.team : o.team !== c.team)) continue;
          if (Math.hypot(o.x - c.x, o.y - c.y) > a.radius) continue;
          const m = this.auras.get(o.id) ?? { ...NO_AURA };
          m[a.stat] += a.enemies ? -a.amount : a.amount;
          this.auras.set(o.id, m);
        }
      }
    }
  }

  private effectiveArmor(u: UnitState): number {
    const broken = u.buffs.reduce((n, b) => (b.kind === 'armorBreak' ? n + b.amount : n), 0);
    return this.def(u).armor + u.mods.armor + this.aura(u).armor - broken;
  }

  private slowOf(u: UnitState): number {
    return Math.min(0.8, u.buffs.reduce((n, b) => (b.kind === 'slow' ? Math.max(n, b.amount) : n), 0));
  }

  private isStunned(u: UnitState): boolean {
    return u.buffs.some((b) => b.kind === 'stun');
  }

  /** One buff per kind and source; reapplying refreshes it. */
  private addBuff(u: UnitState, kind: BuffKind, amount: number, durationMs: number, sourceId: number): void {
    if (u.dead) return;
    if (this.def(u).boss && (kind === 'stun' || kind === 'slow')) durationMs *= BOSS_CC_FACTOR;
    const existing = u.buffs.find((b) => b.kind === kind && b.sourceId === sourceId);
    if (existing) {
      existing.untilMs = this.timeMs + durationMs;
      existing.amount = Math.max(existing.amount, amount);
    } else {
      u.buffs.push({ kind, amount, untilMs: this.timeMs + durationMs, sourceId, tickAtMs: this.timeMs + POISON_STEP_MS });
    }
  }

  /** Expires buffs, deals poison damage in steps and refreshes the status flags. */
  private tickBuffs(u: UnitState): void {
    if (!u.buffs.length) return;
    u.buffs = u.buffs.filter((b) => b.untilMs > this.timeMs);
    let status = 0;
    for (const b of u.buffs) {
      if (b.kind === 'poison') {
        status |= STATUS.poisoned;
        if ((b.tickAtMs ?? 0) <= this.timeMs) {
          b.tickAtMs = this.timeMs + POISON_STEP_MS;
          this.dealDamage(this.units.get(b.sourceId) ?? null, u, (b.amount * POISON_STEP_MS) / 1000);
        }
      } else if (b.kind === 'stun') status |= STATUS.stunned;
      else if (b.kind === 'slow') status |= STATUS.slowed;
      else status |= STATUS.armorBroken;
    }
    u.status = status;
  }

  /** Cooldown abilities: heal the most hurt ally, or blast nearby enemies. */
  private useActives(u: UnitState): void {
    this.abilitiesOf(u).forEach((a, i) => {
      if ((a.kind !== 'heal' && a.kind !== 'nova') || (u.readyAt[i] ?? 0) > this.timeMs) return;
      const near = [...this.units.values()].filter((o) => !o.dead && o.area === u.area && Math.hypot(o.x - u.x, o.y - u.y) <= a.radius);
      if (a.kind === 'heal') {
        const ally = near.filter((o) => o.team === u.team && o.maxHp - o.hp >= a.amount * 0.3).sort((p, q) => q.maxHp - q.hp - (p.maxHp - p.hp))[0];
        if (!ally) return;
        const healed = Math.min(a.amount, ally.maxHp - ally.hp);
        ally.hp += healed;
        this.effect('heal', ally.id, ally, healed);
      } else {
        const foes = near.filter((o) => o.team !== u.team);
        if (!foes.length) return;
        this.effect('nova', u.id, u, a.damage);
        for (const o of foes) this.dealDamage(u, o, a.damage);
      }
      u.readyAt[i] = this.timeMs + a.cooldownMs;
    });
  }

  private effect(effect: EffectKind, unitId: number, at: { area: number; x: number; y: number }, amount: number): void {
    this.events.push({ type: 'effect', effect, unitId, area: at.area, x: at.x, y: at.y, amount });
  }

  private kill(u: UnitState, killer: UnitState | null): void {
    u.hp = 0;
    u.dead = true;
    this.events.push({ type: 'death', unitId: u.id, killerId: killer?.id ?? null, area: u.area, x: u.x, y: u.y });
    if (u.kind === 'king') return this.gameOver(u.team === 0 ? 1 : 0);
    if (!this.isAttacker(u)) return;
    // Bounty goes to the fighter's owner, wherever the kill happened. King kills and the finale pay nothing.
    const receiver = killer?.kind === 'fighter' ? this.players[killer.owner] : undefined;
    const bounty = this.data.waves[this.wave - 1]?.endless ? 0 : this.def(u).bounty ?? 0;
    if (receiver && bounty > 0) {
      receiver.gold += bounty;
      this.events.push({ type: 'gold', player: receiver.index, amount: bounty, reason: 'bounty' });
    }
    this.remove(u);
  }

  private leak(u: UnitState): void {
    const owner = this.players[u.area]!;
    if (u.kind === 'creep') {
      owner.leaks++;
      u.leaked = true;
    }
    this.events.push({ type: 'leak', unitId: u.id, player: owner.index });
    this.moveToArena(u, this.arenaOf(owner.team), ARENA.entryX);
  }

  private warpToKing(u: UnitState): void {
    this.events.push({ type: 'warp', unitId: u.id });
    this.moveToArena(u, this.arenaOf(u.team), ARENA.kingX - 120);
  }

  private moveToArena(u: UnitState, arena: number, x: number): void {
    u.area = arena;
    u.x = x;
    u.y = this.rng.range(32, ARENA.height - 32);
    u.targetId = null;
  }

  /** Pushes overlapping mobile units apart so groups spread out instead of stacking. */
  /**
   * Keeps units from stacking. Allies make room for each other; an enemy never shoves a
   * unit that stands in range of its target (no pushback, as in the original).
   */
  private separate(): void {
    const mobile = [...this.units.values()].filter((u) => !u.dead && this.def(u).moveSpeed > 0);
    for (let i = 0; i < mobile.length; i++) {
      const a = mobile[i]!;
      for (let j = i + 1; j < mobile.length; j++) {
        const b = mobile[j]!;
        if (a.area !== b.area) continue;
        const min = this.def(a).radius + this.def(b).radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        const enemies = a.team !== b.team;
        const holdA = enemies && this.engaged.has(a.id);
        const holdB = enemies && this.engaged.has(b.id);
        if (holdA && holdB) continue;
        const nx = d > 0 ? dx / d : 1;
        const ny = d > 0 ? dy / d : 0;
        // The side that may move takes the whole correction.
        const pushA = holdA ? 0 : holdB ? min - d : (min - d) / 2;
        const pushB = holdB ? 0 : holdA ? min - d : (min - d) / 2;
        a.x -= nx * pushA;
        a.y -= ny * pushA;
        b.x += nx * pushB;
        b.y += ny * pushB;
      }
    }
    this.engaged.clear();
    for (const u of mobile) {
      const h = this.isLane(u.area) ? LANE.height : ARENA.height;
      u.y = Math.min(h, Math.max(0, u.y));
    }
  }

  // ---- helpers ----------------------------------------------------------

  private laneHasAttackers(area: number): boolean {
    if (this.spawnQueue[area]! > 0) return true;
    for (const u of this.units.values()) if (u.area === area && this.isAttacker(u)) return true;
    return false;
  }

  private spawnAttacker(unitId: string, kind: 'creep' | 'merc', lane: PlayerState): void {
    const x = this.rng.range(LANE.spawnMinX, LANE.spawnMaxX) - (kind === 'merc' ? 96 : 0);
    const y = this.rng.range(32, LANE.height - 32);
    const u = this.spawn(unitId, kind, -1, lane.team === 0 ? 1 : 0, lane.index, x, y);
    if (kind === 'creep') {
      u.maxHp = Math.round(u.maxHp * this.data.rules.creepHpMultiplier);
      u.hp = u.maxHp;
    }
  }

  private spawn(defId: string, kind: UnitKind, owner: number, team: TeamId, area: number, x: number, y: number): UnitState {
    const def = this.data.units[defId];
    if (!def) throw new Error(`unknown unit def ${defId}`);
    const u: UnitState = {
      id: this.nextUnitId++,
      def: defId,
      kind,
      owner,
      team,
      area,
      x,
      y,
      hp: def.hp,
      maxHp: def.hp,
      cooldownMs: 0,
      targetId: null,
      dead: false,
      mods: { ...NO_MODS },
      homeArea: area,
      homeX: x,
      homeY: y,
      invested: 0,
      fresh: false,
      leaked: false,
      buffs: [],
      readyAt: [],
      granted: [],
      status: 0,
    };
    this.units.set(u.id, u);
    this.events.push({ type: 'spawn', unitId: u.id });
    return u;
  }

  private remove(u: UnitState): void {
    this.units.delete(u.id);
    this.events.push({ type: 'remove', unitId: u.id });
  }

  private moveTowards(u: UnitState, x: number, y: number, step: number): void {
    const dx = x - u.x;
    const dy = y - u.y;
    const d = Math.hypot(dx, dy);
    if (d <= 0 || step <= 0) return;
    const s = Math.min(step, d);
    u.x += (dx / d) * s;
    u.y += (dy / d) * s;
  }

  private isAttacker(u: UnitState): boolean {
    return u.kind === 'creep' || u.kind === 'merc';
  }
}

function fail(error: string): CommandResult {
  return { ok: false, error };
}

/** Gold and lumber the player's next Prophet reroll costs. */
export function rerollCost(data: GameData, player: PlayerState): number {
  return (player.rerolls + 1) * data.rules.prophet.rerollCost;
}
