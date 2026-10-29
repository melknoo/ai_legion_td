import type { Room } from '@colyseus/sdk';
import {
  UNIT_KINDS,
  decodeEvents,
  type CommandResult,
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
  type WireEvent,
} from '@legion/shared';
import type { Session } from './Session.ts';

/** Loose shape of the synced schema state (see server/src/schema.ts). */
interface NetStateLike {
  status: string;
  players: Iterable<{ sessionId: string; name: string; team: number; builder: string; gold: number; lumber: number; income: number; workers: number; leaks: number; foodCap: number; farmLevel: number; fighters?: Iterable<string>; rerolls?: number; queuedSends?: Iterable<string> }>;
  units: { forEach(cb: (n: NetUnitLike, key: string) => void): void };
  phase: string;
  wave: number;
  timeMs: number;
  phaseEndsAtMs: number;
  winner: number;
  kingLevels: Iterable<number>;
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

/** A game running on the server: commands go up, state patches and event batches come down. */
export class NetSession implements Session {
  readonly game: NetGameView;
  readonly online = true;
  onError?: (message: string) => void;
  private events: GameEvent[] = [];
  private readonly render = new Map<number, { x: number; y: number; area: number }>();

  constructor(
    readonly room: Room,
    data: GameData,
  ) {
    this.game = new NetGameView(data);
    this.game.sync(room.state as NetStateLike);
    room.onStateChange((s) => this.game.sync(s as NetStateLike));
    room.onMessage('ev', (wire: WireEvent[]) => this.events.push(...decodeEvents(wire)));
    room.onMessage('err', (message: string) => this.onError?.(message));
  }

  get localPlayer(): number {
    return Math.max(0, this.game.players.findIndex((p) => p.id === this.room.sessionId));
  }

  update(deltaMs: number): GameEvent[] {
    // State arrives ~10 times a second; ease render positions towards it.
    const k = 1 - Math.exp(-deltaMs / 70);
    for (const u of this.game.units.values()) {
      const r = this.render.get(u.id);
      if (!r || r.area !== u.area) this.render.set(u.id, { x: u.x, y: u.y, area: u.area });
      else {
        r.x += (u.x - r.x) * k;
        r.y += (u.y - r.y) * k;
      }
    }
    for (const id of this.render.keys()) if (!this.game.units.has(id)) this.render.delete(id);
    const out = this.events;
    this.events = [];
    return out;
  }

  interpolated(unitId: number): { x: number; y: number } | null {
    const r = this.render.get(unitId);
    if (r) return r;
    const u = this.game.units.get(unitId);
    return u ? { x: u.x, y: u.y } : null;
  }

  send(cmd: PlayerCommand): CommandResult {
    this.room.send('cmd', cmd);
    return { ok: true };
  }
}
