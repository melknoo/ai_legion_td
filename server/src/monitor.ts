import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { LEGION_DATA, MAX_TEAM_SIZE, MODE_IDS, type ModeId } from '@legion/shared';

// Monitoring for the single home-server instance: JSON log lines on stdout (`docker logs`),
// a public /health for uptime checks, a password-protected /stats page, /client-error
// for browser exceptions and /solo for solo games (they run in the browser). Everything is
// in memory except the optional game history file.

/** Finished or abandoned games are appended here as JSON lines when set (a mounted volume). */
const STATS_FILE = process.env.STATS_FILE;
/** Password for /stats (HTTP basic auth, any user name). Without it the page is off. */
const STATS_TOKEN = process.env.STATS_TOKEN;

const ERROR_LIMIT_PER_MIN = 10;
const ERROR_BODY_MAX = 4096;
const RECENT_MAX = 30;
/** Solo reports per address and minute: a start, one per wave and an end, so a few games' worth. */
const SOLO_LIMIT_PER_MIN = 30;
const SOLO_BODY_MAX = 1024;
/** Solo games listed as running at most; a flood of fake ids can't grow the map further. */
const SOLO_MAX = 200;
/** A solo game reports every wave; silence this long means the tab is gone. */
const SOLO_IDLE_MS = 20 * 60_000;

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

interface RoomInfo {
  status: 'lobby' | 'playing' | 'over';
  /** Humans connected right now. */
  humans: number;
  /** Human seats when the game started; what the game record counts. */
  seats: number;
  bots: number;
  mode: string;
  wave: number;
  startedAt?: number;
}

export interface GameRecord {
  t: string;
  room: string;
  mode: string;
  humans: number;
  bots: number;
  builders: string[];
  wave: number;
  /** Winning team; null for a draw or an abandoned game. */
  winner: number | null;
  /** The room closed before the game was over (everyone left). */
  abandoned: boolean;
  minutes: number;
  /** Played in the browser against bots; reported by the client. */
  solo?: boolean;
}

/** A solo game still running, as its last report described it. */
interface SoloInfo {
  mode: ModeId;
  bots: number;
  builders: string[];
  wave: number;
  timeMs: number;
  lastSeen: number;
}

interface ClientError {
  t: string;
  message: string;
  source: string;
  stack: string;
  ua: string;
}

const startedAt = Date.now();
const rooms = new Map<string, RoomInfo>();
const totals = { gamesStarted: 0, gamesFinished: 0, gamesAbandoned: 0, peakPlayers: 0, clientErrors: 0, soloStarted: 0 };
const builderPicks = new Map<string, number>();
const recentGames: GameRecord[] = [];
const recentErrors: ClientError[] = [];
const soloGames = new Map<string, SoloInfo>();
type Budget = Map<string, { count: number; resetAt: number }>;
const errorBudget: Budget = new Map();
const soloBudget: Budget = new Map();

function pushRecent<T>(list: T[], item: T): void {
  list.unshift(item);
  if (list.length > RECENT_MAX) list.pop();
}

/** Adds a finished or abandoned game to the recent list, the log and the history file. */
function recordGame(record: GameRecord): void {
  pushRecent(recentGames, record);
  log(`${record.solo ? 'solo' : 'game'}.${record.abandoned ? 'abandon' : 'end'}`, { ...record });
  if (STATS_FILE) {
    fs.appendFile(STATS_FILE, JSON.stringify(record) + '\n', (err) => err && log('stats.write-failed', { error: err.message }));
  }
}

function playersOnline(): number {
  let n = 0;
  for (const r of rooms.values()) n += r.humans;
  return n;
}

// ---- hooks for LegionRoom -----------------------------------------------------

export const monitor = {
  roomCreated(id: string): void {
    rooms.set(id, { status: 'lobby', humans: 0, seats: 0, bots: 0, mode: 'ap', wave: 0 });
    log('room.create', { room: id });
  },

  /** Connected humans in a room changed. */
  players(id: string, humans: number): void {
    const r = rooms.get(id);
    if (!r) return;
    r.humans = humans;
    totals.peakPlayers = Math.max(totals.peakPlayers, playersOnline());
  },

  gameStarted(id: string, info: { mode: string; humans: number; bots: number; builders: string[] }): void {
    const r = rooms.get(id);
    if (!r) return;
    Object.assign(r, { status: 'playing', mode: info.mode, humans: info.humans, seats: info.humans, bots: info.bots, startedAt: Date.now() });
    totals.gamesStarted++;
    for (const b of info.builders) builderPicks.set(b, (builderPicks.get(b) ?? 0) + 1);
    log('game.start', { room: id, ...info });
  },

  wave(id: string, wave: number): void {
    const r = rooms.get(id);
    if (r) r.wave = wave;
  },

  gameEnded(id: string, result: { wave: number; winner: number | null; abandoned: boolean; builders: string[] }): void {
    const r = rooms.get(id);
    if (!r || r.status !== 'playing') return;
    r.status = 'over';
    if (result.abandoned) totals.gamesAbandoned++;
    else totals.gamesFinished++;
    const record: GameRecord = {
      t: new Date().toISOString(),
      room: id,
      mode: r.mode,
      humans: r.seats,
      bots: r.bots,
      builders: result.builders,
      wave: result.wave,
      winner: result.winner,
      abandoned: result.abandoned,
      minutes: Math.round((Date.now() - (r.startedAt ?? Date.now())) / 6000) / 10,
    };
    recordGame(record);
  },

  roomDisposed(id: string): void {
    rooms.delete(id);
    log('room.dispose', { room: id });
  },
};

// ---- HTTP -------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function health(res: ServerResponse): void {
  sendJson(res, 200, {
    ok: true,
    uptimeS: Math.round((Date.now() - startedAt) / 1000),
    rooms: rooms.size,
    playing: [...rooms.values()].filter((r) => r.status === 'playing').length,
    players: playersOnline(),
  });
}

/** Cloudflare passes the visitor's address on; without the tunnel the socket's is used. */
function clientIp(req: IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip'];
  return (typeof cf === 'string' && cf) || req.socket.remoteAddress || '?';
}

function withinBudget(budget: Budget, ip: string, limit: number): boolean {
  const now = Date.now();
  const b = budget.get(ip);
  if (!b || now >= b.resetAt) {
    // Drop stale entries now and then so the map can't grow without bound.
    if (budget.size > 1000) for (const [k, v] of budget) if (now >= v.resetAt) budget.delete(k);
    budget.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  return ++b.count <= limit;
}

/** Reads a small JSON object body; answers 413/400 itself when it is too big or not an object. */
function readJson(req: IncomingMessage, res: ServerResponse, max: number, then: (data: Record<string, unknown>) => void): void {
  let body = '';
  let tooBig = false;
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    if (tooBig) return; // drain the rest unread
    body += chunk;
    if (body.length > max) {
      tooBig = true;
      body = '';
      res.writeHead(413, { Connection: 'close' }).end();
    }
  });
  req.on('end', () => {
    if (tooBig) return;
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return void res.writeHead(400).end();
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return void res.writeHead(400).end();
    then(data as Record<string, unknown>);
  });
}

function clientError(req: IncomingMessage, res: ServerResponse): void {
  if (!withinBudget(errorBudget, clientIp(req), ERROR_LIMIT_PER_MIN)) return void res.writeHead(429).end();
  readJson(req, res, ERROR_BODY_MAX, (data) => {
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    const entry: ClientError = {
      t: new Date().toISOString(),
      message: str(data.message, 300),
      source: str(data.source, 200),
      stack: str(data.stack, 1500),
      ua: str(req.headers['user-agent'], 150),
    };
    totals.clientErrors++;
    pushRecent(recentErrors, entry);
    log('client.error', { ...entry });
    res.writeHead(204).end();
  });
}

function soloRecord(id: string, info: SoloInfo, winner: number | null, abandoned: boolean): GameRecord {
  return {
    t: new Date().toISOString(),
    room: `solo-${id}`,
    mode: info.mode,
    humans: 1,
    bots: info.bots,
    builders: info.builders,
    wave: info.wave,
    winner,
    abandoned,
    minutes: Math.round(info.timeMs / 6000) / 10,
    solo: true,
  };
}

/** Solo games whose tab went quiet count as abandoned. */
function pruneSolo(): void {
  const now = Date.now();
  for (const [id, info] of soloGames) {
    if (now - info.lastSeen < SOLO_IDLE_MS) continue;
    soloGames.delete(id);
    recordGame(soloRecord(id, info, null, true));
  }
}

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/**
 * A solo game's client reports its start, each wave and its end (or that the player left).
 * Anyone can post here, so every field is checked against the game data and the rate is capped.
 */
function soloReport(req: IncomingMessage, res: ServerResponse): void {
  if (!withinBudget(soloBudget, clientIp(req), SOLO_LIMIT_PER_MIN)) return void res.writeHead(429).end();
  readJson(req, res, SOLO_BODY_MAX, (d) => {
    const { id, event, mode, size, builders, wave, timeMs, winner, abandoned } = d;
    const valid =
      typeof id === 'string' && /^[a-z0-9]{6,16}$/.test(id) &&
      (event === 'start' || event === 'wave' || event === 'end') &&
      MODE_IDS.includes(mode as ModeId) &&
      isInt(size, 1, MAX_TEAM_SIZE) &&
      Array.isArray(builders) && builders.length === size * 2 &&
      builders.every((b) => typeof b === 'string' && Object.hasOwn(LEGION_DATA.builders, b)) &&
      isInt(wave, 1, LEGION_DATA.waves.length + 1) &&
      isInt(timeMs, 0, 24 * 3_600_000) &&
      (winner === undefined || winner === null || winner === 0 || winner === 1) &&
      (abandoned === undefined || typeof abandoned === 'boolean');
    if (!valid) return void res.writeHead(400).end();
    pruneSolo();
    const known = soloGames.has(id);
    if (!known && event !== 'end' && soloGames.size >= SOLO_MAX) return void res.writeHead(503).end();
    const info: SoloInfo = { mode: mode as ModeId, bots: size * 2 - 1, builders: builders as string[], wave, timeMs, lastSeen: Date.now() };
    if (event === 'end') {
      soloGames.delete(id);
      recordGame(soloRecord(id, info, (winner as 0 | 1 | null | undefined) ?? null, abandoned === true));
    } else {
      soloGames.set(id, info);
      // A wave report after a server restart picks the game up again without counting a new start.
      if (!known && event === 'start') {
        totals.soloStarted++;
        for (const b of info.builders) builderPicks.set(b, (builderPicks.get(b) ?? 0) + 1);
        log('solo.start', { solo: id, mode: info.mode, bots: info.bots, builders: info.builders });
      }
    }
    res.writeHead(204).end();
  });
}

function authorized(req: IncomingMessage): boolean {
  if (!STATS_TOKEN) return false;
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
  const expected = Buffer.from(STATS_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const esc = (v: unknown) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function table(head: string[], rows: unknown[][]): string {
  if (!rows.length) return '<p class="none">none</p>';
  const th = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/** Older games from the history file, so the page survives restarts. */
function historyFromFile(): GameRecord[] {
  if (!STATS_FILE) return [];
  try {
    const lines = fs.readFileSync(STATS_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.map((l) => JSON.parse(l) as GameRecord);
  } catch {
    return [];
  }
}

function stats(req: IncomingMessage, res: ServerResponse): void {
  if (!STATS_TOKEN) return void res.writeHead(404).end();
  if (!authorized(req)) {
    return void res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="legion stats"' }).end();
  }
  const history = historyFromFile();
  const games = history.length ? history.slice(-RECENT_MAX).reverse() : recentGames;
  const allGames = history.length ? history : recentGames;
  const picks = new Map<string, number>(builderPicks);
  if (history.length) {
    picks.clear();
    for (const g of history) for (const b of g.builders) picks.set(b, (picks.get(b) ?? 0) + 1);
  }
  const days = new Map<string, number>();
  for (const g of allGames) days.set(g.t.slice(0, 10), (days.get(g.t.slice(0, 10)) ?? 0) + 1);
  pruneSolo();
  const uptimeH = ((Date.now() - startedAt) / 3_600_000).toFixed(1);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Legion stats</title><style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#0b0b18;color:#e8e8f0}
h1{font-size:20px}h2{font-size:15px;margin-top:24px;color:#c0c8f0}
table{border-collapse:collapse;max-width:100%;display:block;overflow-x:auto}
th,td{border:1px solid #333a66;padding:3px 8px;text-align:left;vertical-align:top}
th{background:#1c1c58}td{font-variant-numeric:tabular-nums}.none{color:#888}
.kpi{display:flex;flex-wrap:wrap;gap:12px}.kpi div{background:#1c1c58;padding:8px 12px;border-radius:4px}
</style></head><body><h1>Legion Pixel – server stats</h1>
<div class="kpi"><div>uptime ${esc(uptimeH)} h</div><div>rooms ${rooms.size}</div><div>players now ${playersOnline()}</div>
<div>peak players ${totals.peakPlayers}</div><div>games started ${totals.gamesStarted}</div><div>finished ${totals.gamesFinished}</div>
<div>abandoned ${totals.gamesAbandoned}</div><div>solo now ${soloGames.size}</div><div>solo started ${totals.soloStarted}</div>
<div>client errors ${totals.clientErrors}</div></div>
<p class="none">Counters since the last restart; tables below use the history file when one is set.</p>
<h2>Open rooms</h2>${table(['room', 'status', 'mode', 'humans', 'bots', 'wave'], [...rooms].map(([id, r]) => [id, r.status, r.mode, r.humans, r.bots, r.wave]))}
<h2>Solo games now</h2>${table(['game', 'mode', 'bots', 'builders', 'wave', 'min', 'last report'], [...soloGames].map(([id, g]) => [id, g.mode, g.bots, g.builders.join(', '), g.wave, Math.round(g.timeMs / 6000) / 10, `${Math.round((Date.now() - g.lastSeen) / 1000)} s ago`]))}
<h2>Recent games</h2>${table(['time (UTC)', 'mode', 'humans', 'bots', 'builders', 'wave', 'winner', 'min'], games.map((g) => [g.t.slice(0, 16).replace('T', ' '), g.solo ? `solo ${g.mode}` : g.mode, g.humans, g.bots, g.builders.join(', '), g.wave, g.abandoned ? 'abandoned' : g.winner ?? 'draw', g.minutes]))}
<h2>Games per day</h2>${table(['day', 'games'], [...days].sort().reverse().slice(0, 30))}
<h2>Builder picks</h2>${table(['builder', 'picks'], [...picks].sort((a, b) => b[1] - a[1]))}
<h2>Recent client errors</h2>${table(['time (UTC)', 'message', 'source', 'browser', 'stack'], recentErrors.map((e) => [e.t.slice(0, 19).replace('T', ' '), e.message, e.source, e.ua, e.stack]))}
</body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

/** Express-style middleware for /health, /stats, /client-error and /solo; everything else passes on. */
export function monitorRoutes() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/health' && req.method === 'GET') return health(res);
    if (url === '/stats' && req.method === 'GET') return stats(req, res);
    if (url === '/client-error' && req.method === 'POST') return clientError(req, res);
    if (url === '/solo' && req.method === 'POST') return soloReport(req, res);
    next();
  };
}
