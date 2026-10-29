import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

// Monitoring for the single home-server instance: JSON log lines on stdout (`docker logs`),
// a public /health for uptime checks, a password-protected /stats page, and /client-error
// for browser exceptions. Everything is in memory except the optional game history file.

/** Finished or abandoned games are appended here as JSON lines when set (a mounted volume). */
const STATS_FILE = process.env.STATS_FILE;
/** Password for /stats (HTTP basic auth, any user name). Without it the page is off. */
const STATS_TOKEN = process.env.STATS_TOKEN;

const ERROR_LIMIT_PER_MIN = 10;
const ERROR_BODY_MAX = 4096;
const RECENT_MAX = 30;

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
const totals = { gamesStarted: 0, gamesFinished: 0, gamesAbandoned: 0, peakPlayers: 0, clientErrors: 0 };
const builderPicks = new Map<string, number>();
const recentGames: GameRecord[] = [];
const recentErrors: ClientError[] = [];
const errorBudget = new Map<string, { count: number; resetAt: number }>();

function pushRecent<T>(list: T[], item: T): void {
  list.unshift(item);
  if (list.length > RECENT_MAX) list.pop();
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
    pushRecent(recentGames, record);
    log(result.abandoned ? 'game.abandon' : 'game.end', { ...record });
    if (STATS_FILE) {
      fs.appendFile(STATS_FILE, JSON.stringify(record) + '\n', (err) => err && log('stats.write-failed', { error: err.message }));
    }
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

function withinBudget(ip: string): boolean {
  const now = Date.now();
  const b = errorBudget.get(ip);
  if (!b || now >= b.resetAt) {
    // Drop stale entries now and then so the map can't grow without bound.
    if (errorBudget.size > 1000) for (const [k, v] of errorBudget) if (now >= v.resetAt) errorBudget.delete(k);
    errorBudget.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  return ++b.count <= ERROR_LIMIT_PER_MIN;
}

function clientError(req: IncomingMessage, res: ServerResponse): void {
  if (!withinBudget(clientIp(req))) return void res.writeHead(429).end();
  let body = '';
  let tooBig = false;
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    if (tooBig) return; // drain the rest unread
    body += chunk;
    if (body.length > ERROR_BODY_MAX) {
      tooBig = true;
      body = '';
      res.writeHead(413, { Connection: 'close' }).end();
    }
  });
  req.on('end', () => {
    if (tooBig) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return void res.writeHead(400).end();
    }
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
<div>abandoned ${totals.gamesAbandoned}</div><div>client errors ${totals.clientErrors}</div></div>
<p class="none">Counters since the last restart; tables below use the history file when one is set.</p>
<h2>Open rooms</h2>${table(['room', 'status', 'mode', 'humans', 'bots', 'wave'], [...rooms].map(([id, r]) => [id, r.status, r.mode, r.humans, r.bots, r.wave]))}
<h2>Recent games</h2>${table(['time (UTC)', 'mode', 'humans', 'bots', 'builders', 'wave', 'winner', 'min'], games.map((g) => [g.t.slice(0, 16).replace('T', ' '), g.mode, g.humans, g.bots, g.builders.join(', '), g.wave, g.abandoned ? 'abandoned' : g.winner ?? 'draw', g.minutes]))}
<h2>Games per day</h2>${table(['day', 'games'], [...days].sort().reverse().slice(0, 30))}
<h2>Builder picks</h2>${table(['builder', 'picks'], [...picks].sort((a, b) => b[1] - a[1]))}
<h2>Recent client errors</h2>${table(['time (UTC)', 'message', 'source', 'browser', 'stack'], recentErrors.map((e) => [e.t.slice(0, 19).replace('T', ' '), e.message, e.source, e.ua, e.stack]))}
</body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

/** Express-style middleware for /health, /stats and /client-error; everything else passes on. */
export function monitorRoutes() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/health' && req.method === 'GET') return health(res);
    if (url === '/stats' && req.method === 'GET') return stats(req, res);
    if (url === '/client-error' && req.method === 'POST') return clientError(req, res);
    next();
  };
}
