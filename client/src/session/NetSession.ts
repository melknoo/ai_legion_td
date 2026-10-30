import type { Room } from '@colyseus/sdk';
import {
  UNIT_KINDS,
  decodeEvents,
  type CommandResult,
  type EventBatch,
  type GameData,
  type GameEvent,
  type GameView,
  type KingStat,
  type Phase,
  type PlayerCommand,
  type PlayerState,
  type TeamId,
  type UnitDef,
  type UnitState,
} from '@legion/shared';
import type { Session } from './Session.ts';

/** Loose shape of the synced schema state (see server/src/schema.ts). */
interface NetStateLike {
  status: string;
  players: Iterable<NetPlayerLike>;
  units: { forEach(cb: (n: NetUnitLike, key: string) => void): void };
  phase: string;
  wave: number;
  timeMs: number;
  phaseEndsAtMs: number;
  winner: number;
  kingLevels: Iterable<number>;
}

interface NetPlayerLike {
  sessionId: string;
  name: string;
  team: number;
  builder: string;
  gold: number;
  lumber: number;
  income: number;
  workers: number;
  leaks: number;
  foodCap: number;
  farmLevel: number;
  fighters?: Iterable<string>;
  rerolls?: number;
  queuedSends?: Iterable<string>;
}

interface NetUnitLike {
  def: string;
  kind: number;
  owner: number;
  team: number;
  area: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  target: number;
  col: number;
  row: number;
  invested: number;
  fresh: boolean;
  leaked: boolean;
  modDamage: number;
  modArmor: number;
  status: number;
}

/** Client-side mirror of the server's game, shaped like the simulation for the renderer and HUD. */
export class NetGameView implements GameView {
  players: PlayerState[] = [];
  units = new Map<number, UnitState>();
  phase: Phase = 'build';
  wave = 1;
  timeMs = 0;
  phaseEndsAtMs = 0;
  winner: TeamId | null = null;
  kingLevels: Record<TeamId, Record<KingStat, number>> = { 0: { hp: 0, attack: 0, regen: 0 }, 1: { hp: 0, attack: 0, regen: 0 } };

  constructor(readonly data: GameData) {}

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

  foodUsed(player: number): number {
    let food = 0;
    for (const u of this.units.values()) if (u.kind === 'fighter' && u.owner === player) food += this.def(u).food ?? 0;
    return food;
  }

  battleArena(): number {
    return this.players.length + 2;
  }

  /** Copies the latest server state; unit objects keep their identity across updates. */
  sync(s: NetStateLike): void {
    this.players = [...s.players].map((p, index) => ({
      index,
      id: p.sessionId,
      name: p.name,
      team: p.team as TeamId,
      builder: p.builder,
      fighters: [...(p.fighters ?? [])],
      rerolls: p.rerolls ?? 0,
      queuedSends: [...(p.queuedSends ?? [])],
      gold: p.gold ?? 0,
      lumber: p.lumber ?? 0,
      income: p.income ?? 0,
      workers: p.workers ?? 0,
      leaks: p.leaks ?? 0,
      foodCap: p.foodCap ?? 0,
      farmLevel: p.farmLevel ?? 0,
    }));
    this.phase = (s.phase as Phase) || 'build';
    this.wave = s.wave || 1;
    this.timeMs = s.timeMs ?? 0;
    this.phaseEndsAtMs = s.phaseEndsAtMs ?? 0;
    this.winner = s.winner === 0 || s.winner === 1 ? s.winner : null;
    const lv = [...s.kingLevels];
    this.kingLevels = {
      0: { hp: lv[0] ?? 0, attack: lv[1] ?? 0, regen: lv[2] ?? 0 },
      1: { hp: lv[3] ?? 0, attack: lv[4] ?? 0, regen: lv[5] ?? 0 },
    };

    const seen = new Set<number>();
    s.units.forEach((n, key) => {
      const id = Number(key);
      seen.add(id);
      let u = this.units.get(id);
      if (!u) {
        u = {
          id, def: n.def, kind: UNIT_KINDS[n.kind] ?? 'creep', owner: n.owner, team: n.team as TeamId, area: n.area,
          x: n.x, y: n.y, hp: n.hp, maxHp: n.maxHp, cooldownMs: 0, targetId: null, dead: false,
          mods: { hp: 0, damage: 0, regen: 0, armor: 0, attackSpeed: 0 },
          homeArea: n.area, homeX: n.x, homeY: n.y, invested: 0, fresh: false, leaked: false,
          buffs: [], readyAt: [], granted: [], status: 0,
        };
        this.units.set(id, u);
      }
      u.def = n.def;
      u.area = n.area;
      u.x = n.x;
      u.y = n.y;
      u.hp = n.hp;
      u.maxHp = n.maxHp;
      u.dead = n.dead;
      u.targetId = n.target >= 0 ? n.target : null;
      u.cell = n.col >= 0 ? { col: n.col, row: n.row } : undefined;
      u.invested = n.invested;
      u.fresh = n.fresh;
      u.leaked = n.leaked;
      // Kings learn their abilities at the end of fixed waves; the schema doesn't carry them.
      if (u.kind === 'king') u.granted = (this.data.rules.king.grants ?? []).filter((g) => g.wave < this.wave).map((g) => g.ability);
      u.mods.damage = n.modDamage;
      u.mods.armor = n.modArmor;
      u.status = n.status ?? 0;
    });
    for (const id of this.units.keys()) if (!seen.has(id)) this.units.delete(id);
  }
}

/** How far behind the server the client plays the match: one patch interval plus room for jitter. */
const PLAYOUT_MS = 150;
/** Further off than this (start, background tab), the playback clock jumps instead of easing. */
const CLOCK_SNAP_MS = 500;

/** A frozen copy of one state patch; the live schema keeps changing under it. */
interface Snapshot extends NetStateLike {
  units: Map<string, NetUnitLike>;
}

function snapshot(s: NetStateLike): Snapshot {
  const units = new Map<string, NetUnitLike>();
  s.units.forEach((n, key) => units.set(key, {
    def: n.def, kind: n.kind, owner: n.owner, team: n.team, area: n.area, x: n.x, y: n.y, hp: n.hp, maxHp: n.maxHp,
    dead: n.dead, target: n.target, col: n.col, row: n.row, invested: n.invested, fresh: n.fresh, leaked: n.leaked,
    modDamage: n.modDamage, modArmor: n.modArmor, status: n.status,
  }));
  return {
    status: s.status,
    players: [...s.players].map((p) => ({ ...p, fighters: [...(p.fighters ?? [])], queuedSends: [...(p.queuedSends ?? [])] })),
    units,
    phase: s.phase,
    wave: s.wave,
    timeMs: s.timeMs,
    phaseEndsAtMs: s.phaseEndsAtMs,
    winner: s.winner,
    kingLevels: [...s.kingLevels],
  };
}

/**
 * A game running on the server: commands go up, state patches and event batches come down.
 * Patches and events are buffered and played back a fixed PLAYOUT_MS behind the server, each at
 * the sim time it happened, so shots, hits and positions stay in step instead of arriving in clumps.
 */
export class NetSession implements Session {
  readonly game: NetGameView;
  readonly online = true;
  onError?: (message: string) => void;
  private readonly snapshots: Snapshot[] = [];
  private readonly events: { t: number; events: GameEvent[] }[] = [];
  /** The snapshot the game view shows; positions ease towards the next queued one. */
  private shown: Snapshot;
  /** Playback time on the server's sim clock. */
  private clock: number;

  constructor(
    readonly room: Room,
    data: GameData,
  ) {
    this.game = new NetGameView(data);
    this.shown = snapshot(room.state as NetStateLike);
    this.game.sync(this.shown);
    this.clock = this.shown.timeMs - PLAYOUT_MS;
    room.onStateChange((s) => this.snapshots.push(snapshot(s as NetStateLike)));
    room.onMessage('ev', (batch: EventBatch) => {
      for (const [t, wire] of batch) this.events.push({ t, events: decodeEvents(wire) });
    });
    room.onMessage('err', (message: string) => this.onError?.(message));
  }

  get localPlayer(): number {
    return Math.max(0, this.game.players.findIndex((p) => p.id === this.room.sessionId));
  }

  update(deltaMs: number): GameEvent[] {
    // Run slightly faster or slower to hold the playback PLAYOUT_MS behind the newest patch.
    const latest = this.snapshots.at(-1) ?? this.shown;
    const drift = latest.timeMs - PLAYOUT_MS - this.clock;
    if (Math.abs(drift) > CLOCK_SNAP_MS) this.clock += drift;
    else this.clock += deltaMs * (1 + Math.max(-0.1, Math.min(0.1, drift / 500)));

    const before = this.shown;
    while (this.snapshots[0] && this.snapshots[0].timeMs <= this.clock) this.shown = this.snapshots.shift()!;
    if (this.shown !== before) this.game.sync(this.shown);

    const out: GameEvent[] = [];
    while (this.events[0] && this.events[0].t <= this.clock) out.push(...this.events.shift()!.events);
    return out;
  }

  interpolated(unitId: number): { x: number; y: number } | null {
    const key = String(unitId);
    const a = this.shown.units.get(key);
    if (!a) {
      const u = this.game.units.get(unitId);
      return u ? { x: u.x, y: u.y } : null;
    }
    const next = this.snapshots[0];
    const b = next?.units.get(key);
    if (!next || !b || b.area !== a.area || next.timeMs <= this.shown.timeMs) return { x: a.x, y: a.y };
    const k = Math.max(0, Math.min(1, (this.clock - this.shown.timeMs) / (next.timeMs - this.shown.timeMs)));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  send(cmd: PlayerCommand): CommandResult {
    this.room.send('cmd', cmd);
    return { ok: true };
  }
}
