import type { GameEvent } from '../sim/game.ts';
import type { GameData, Phase, TeamId, UnitKind } from '../sim/types.ts';
import { EFFECT_KINDS } from '../sim/abilities.ts';

export const ROOM_NAME = 'legion';
export const SERVER_PORT = 2567;
export const MAX_TEAM_SIZE = 4;

export const UNIT_KINDS: readonly UnitKind[] = ['fighter', 'creep', 'merc', 'king'];
const PHASES: readonly Phase[] = ['build', 'fight', 'arena', 'over'];

export interface JoinOptions {
  name?: string;
  /** Dev aid: short build phases. */
  fast?: boolean;
}

/** Builder selection modes, as in Legion TD Mega (-ap, -ar, -sd). */
export const MODES = {
  ap: { name: 'ALL PICK', hint: 'EVERYONE PICKS A BUILDER' },
  ar: { name: 'ALL RANDOM', hint: 'BUILDERS ARE ROLLED AT START' },
  sd: { name: 'SINGLE DRAFT', hint: 'PICK ONE OF TWO RANDOM BUILDERS' },
  apr: { name: 'ALL PROPHET', hint: 'EVERYONE PLAYS THE PROPHET' },
} as const;
export type ModeId = keyof typeof MODES;
export const MODE_IDS = Object.keys(MODES) as ModeId[];
/** Builders offered per player in single draft. */
export const DRAFT_SIZE = 2;

/** Builders random and draft rolls may hand out: every real one, not the Prophet. */
export function rollableBuilders(data: GameData): string[] {
  return Object.values(data.builders)
    .filter((b) => !b.random)
    .map((b) => b.id);
}

/** Modes that assign the builder instead of letting players pick. */
export function modeLocksBuilder(mode: string): boolean {
  return mode === 'ar' || mode === 'apr';
}

/** Lobby messages a client may send (message type -> payload). */
export interface LobbyMessages {
  setBuilder: string;
  setTeam: TeamId;
  setReady: boolean;
  setMode: ModeId;
  addBot: TeamId;
  removeBot: number;
  start: null;
}

/** Picks `count` distinct builders using `random` in [0, 1). */
export function rollBuilders(builders: readonly string[], count: number, random: () => number): string[] {
  const pool = [...builders];
  const out: string[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  return out;
}

/** Visual events sent to clients as compact number arrays; state changes travel via schema patches. */
export type WireEvent = number[];

const ATTACK = 0;
const DAMAGE = 1;
const DEATH = 2;
const LEAK = 3;
const PHASE = 4;
const GAME_OVER = 5;
const ARENA_END = 6;
const EFFECT = 7;

export function encodeEvents(events: readonly GameEvent[]): WireEvent[] {
  const out: WireEvent[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'attack':
        out.push([ATTACK, e.unitId, e.targetId]);
        break;
      case 'damage':
        out.push([DAMAGE, e.sourceId, e.targetId, Math.round(e.amount), e.area, Math.round(e.x), Math.round(e.y)]);
        break;
      case 'death':
        out.push([DEATH, e.unitId, e.killerId ?? -1, e.area, Math.round(e.x), Math.round(e.y)]);
        break;
      case 'leak':
        out.push([LEAK, e.unitId, e.player]);
        break;
      case 'phase':
        out.push([PHASE, PHASES.indexOf(e.phase), e.wave, e.endsAtMs]);
        break;
      case 'gameOver':
        out.push([GAME_OVER, e.winner ?? -1]);
        break;
      case 'arenaEnd':
        out.push([ARENA_END, e.winner ?? -1, e.gold]);
        break;
      case 'effect':
        out.push([EFFECT, EFFECT_KINDS.indexOf(e.effect), e.unitId, e.area, Math.round(e.x), Math.round(e.y), Math.round(e.amount)]);
        break;
      default:
        break; // spawns, removals, gold and upgrades are visible in the synced state
    }
  }
  return out;
}

export function decodeEvents(wire: readonly WireEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (const w of wire) {
    const [code, a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = w;
    switch (code) {
      case ATTACK:
        out.push({ type: 'attack', unitId: a, targetId: b });
        break;
      case DAMAGE:
        out.push({ type: 'damage', sourceId: a, targetId: b, amount: c, area: d, x: e, y: f });
        break;
      case DEATH:
        out.push({ type: 'death', unitId: a, killerId: b < 0 ? null : b, area: c, x: d, y: e });
        break;
      case LEAK:
        out.push({ type: 'leak', unitId: a, player: b });
        break;
      case PHASE:
        out.push({ type: 'phase', phase: PHASES[a] ?? 'build', wave: b, endsAtMs: c });
        break;
      case GAME_OVER:
        out.push({ type: 'gameOver', winner: a < 0 ? null : (a as TeamId) });
        break;
      case ARENA_END:
        out.push({ type: 'arenaEnd', winner: a < 0 ? null : (a as TeamId), gold: b });
        break;
      case EFFECT:
        out.push({ type: 'effect', effect: EFFECT_KINDS[a] ?? 'splash', unitId: b, area: c, x: d, y: e, amount: f });
        break;
    }
  }
  return out;
}
