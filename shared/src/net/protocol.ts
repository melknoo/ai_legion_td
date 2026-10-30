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
  /** Creating a room: keep it out of the public game list (joinable by code only). */
  private?: boolean;
  /** Creating a room: its name in the game list; empty means "<HOST>'S GAME". */
  title?: string;
}

/** Longest game name; the game list has a fixed column for it. */
export const ROOM_TITLE_MAX = 16;
/** Characters a game name may use (all drawable by the bitmap font). */
export const ROOM_TITLE_CHARS = /[A-Z0-9 '!?.-]/;

/** Uppercased, filtered and cut game name, or the host's default. */
export function roomTitle(raw: unknown, host: string): string {
  const clean = typeof raw === 'string' ? [...raw.toUpperCase()].filter((c) => ROOM_TITLE_CHARS.test(c)).join('').trim() : '';
  return (clean || `${host}'S GAME`).slice(0, ROOM_TITLE_MAX);
}

/** Longest player name; lobby rows and the HUD have a fixed column for it. */
export const NAME_MAX = 10;
/** Characters a player name may use. */
export const NAME_CHARS = /[A-Z0-9 ]/;

/** Uppercased, filtered and cut player name; empty if nothing usable is left. */
export function playerName(raw: unknown): string {
  return typeof raw === 'string' ? [...raw.toUpperCase()].filter((c) => NAME_CHARS.test(c)).join('').trim().slice(0, NAME_MAX).trim() : '';
}

/** Who sees a chat line: the sender's team or everyone (the lobby is always everyone). */
export type ChatScope = 'team' | 'all';
/** Longest chat line; the input field shows it in full. */
export const CHAT_MAX = 50;

/** Chat text cut to printable ASCII (all the bitmap font can draw), single spaces, at most CHAT_MAX. */
export function chatText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
    .slice(0, CHAT_MAX)
    .trim();
}

/** A chat line as the server relays it in a `chat` message. */
export interface ChatLine {
  /** Sender's slot (game player index). */
  from: number;
  name: string;
  team: TeamId;
  scope: ChatScope;
  text: string;
}

/** One open public lobby, as `GET /rooms` lists it. */
export interface RoomListing {
  id: string;
  title: string;
  mode: string;
  /** Taken slots, bots included. */
  players: number;
  max: number;
}

/** Matchmaking metadata a lobby keeps up to date for the game list. */
export interface RoomMeta {
  title: string;
  mode: string;
  players: number;
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
  setPrivate: boolean;
  addBot: TeamId;
  removeBot: number;
  start: null;
  /** Rename yourself before the game starts. */
  setName: string;
  /** Also sent during the game. */
  chat: { scope: ChatScope; text: string };
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
/** One `ev` message: the events of each tick since the last one, tagged with that tick's sim time. */
export type EventBatch = [timeMs: number, events: WireEvent[]][];

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
        out.push([ATTACK, e.unitId, e.targetId, Math.round(e.x), Math.round(e.y)]);
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
        out.push({ type: 'attack', unitId: a, targetId: b, x: c, y: d });
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
