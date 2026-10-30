import { Room, ServerError, type AuthContext, type Client, type RoomException } from 'colyseus';
import {
  Game,
  LEGION_DATA,
  MAX_TEAM_SIZE,
  TICK_MS,
  UNIT_KINDS,
  DRAFT_SIZE,
  MODE_IDS,
  PROPHET,
  botCommands,
  encodeEvents,
  modeLocksBuilder,
  rollBuilders,
  rollableBuilders,
  type GameData,
  type GameEvent,
  type JoinOptions,
  type ModeId,
  type PlayerCommand,
  type TeamId,
} from '@legion/shared';
import { log, monitor } from './monitor.ts';
import { NetPlayer, NetState, NetUnit } from './schema.ts';

const COMMANDS = new Set(['build', 'upgrade', 'sell', 'sendMerc', 'buyWorker', 'upgradeKing', 'upgradeFarm', 'reroll']);
/** Ticks between event broadcasts; matches the 100 ms patch rate. */
const EVENT_EVERY = 2;
/** Open rooms on this one instance; each running match costs a 20 Hz sim with bots. */
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 40);
/** Connections per address across all rooms, so one script cannot open rooms without end. */
const MAX_PER_IP = Number(process.env.MAX_PER_IP ?? 6);

let openRooms = 0;
const connections = new Map<string, number>();

/**
 * One match: a lobby where players pick team and builder, then the authoritative
 * simulation. Clients only send commands; state flows back as schema patches plus
 * batched visual events.
 */
export class LegionRoom extends Room<{ state: NetState }> {
  override maxClients = MAX_TEAM_SIZE * 2;
  override patchRate = 100;
  override maxMessagesPerSecond = 30;
  override state = new NetState();

  private game: Game | null = null;
  private data: GameData = LEGION_DATA;
  private timer: { clear(): void } | null = null;
  /** Address of each connected session, for the per-address cap. */
  private ips = new Map<string, string>();
  /** Counted in `openRooms`; a room turned away in onCreate still gets disposed. */
  private counted = false;
  private pending: GameEvent[] = [];
  private ticks = 0;

  override onCreate(options: JoinOptions): void {
    if (openRooms >= MAX_ROOMS) throw new ServerError(503, 'server full - try again in a few minutes');
    openRooms++;
    this.counted = true;
    this.state.status = 'lobby';
    this.state.mode = 'ap';
    this.state.winner = -1;
    monitor.roomCreated(this.roomId);
    if (options.fast) {
      this.data = { ...LEGION_DATA, rules: { ...LEGION_DATA.rules, firstBuildMs: 8000, buildBaseMs: 8000, buildPerWaveMs: 0 } };
    }

    this.onMessage('setBuilder', (client, builder: string) => {
      const p = this.slotOf(client);
      if (!p || !this.inLobby() || typeof builder !== 'string' || !Object.hasOwn(this.data.builders, builder) || modeLocksBuilder(this.state.mode)) return;
      if (this.state.mode === 'sd' && !p.offer.includes(builder)) return;
      p.builder = builder;
    });
    this.onMessage('setMode', (client, mode: ModeId) => {
      if (!this.isHost(client) || !this.inLobby() || !MODE_IDS.includes(mode)) return;
      this.state.mode = mode;
      for (const p of this.state.players) this.applyMode(p);
    });
    this.onMessage('setTeam', (client, team: TeamId) => {
      const p = this.slotOf(client);
      if (p && this.inLobby() && (team === 0 || team === 1) && this.teamSize(team) < MAX_TEAM_SIZE) p.team = team;
    });
    this.onMessage('setReady', (client, ready: boolean) => {
      const p = this.slotOf(client);
      if (p && this.inLobby()) p.ready = !!ready;
    });
    this.onMessage('addBot', (client, team: TeamId) => {
      if (!this.isHost(client) || !this.inLobby() || (team !== 0 && team !== 1) || this.teamSize(team) >= MAX_TEAM_SIZE) return;
      const builders = rollableBuilders(this.data);
      const bot = new NetPlayer();
      bot.name = `BOT ${this.state.players.length + 1}`;
      bot.team = team;
      bot.builder = builders[Math.floor(Math.random() * builders.length)]!;
      bot.bot = true;
      bot.ready = true;
      bot.connected = true;
      this.applyMode(bot);
      this.state.players.push(bot);
    });
    this.onMessage('removeBot', (client, index: number) => {
      const p = this.state.players[index];
      if (this.isHost(client) && this.inLobby() && p?.bot) this.state.players.splice(index, 1);
    });
    this.onMessage('start', (client) => {
      if (this.isHost(client) && this.inLobby()) this.startGame(client);
    });
    this.onMessage('cmd', (client, cmd: PlayerCommand) => {
      if (!this.game || !cmd || typeof cmd !== 'object' || !COMMANDS.has(cmd.type)) return;
      const player = this.state.players.findIndex((p) => p.sessionId === client.sessionId);
      if (player < 0) return;
      const result = this.game.apply({ ...cmd, player } as Parameters<Game['apply']>[0]);
      if (!result.ok) client.send('err', result.error);
    });
  }

  override onAuth(client: Client, _options: JoinOptions, context: AuthContext): boolean {
    // Behind the Cloudflare tunnel the visitor's address comes in a header.
    const ip = context.headers.get('cf-connecting-ip') ?? context.ip ?? '?';
    if ((connections.get(ip) ?? 0) >= MAX_PER_IP) throw new ServerError(429, 'too many connections from your address');
    connections.set(ip, (connections.get(ip) ?? 0) + 1);
    this.ips.set(client.sessionId, ip);
    return true;
  }

  override onJoin(client: Client, options: JoinOptions): void {
    const p = new NetPlayer();
    p.sessionId = client.sessionId;
    p.name = (options.name ?? '').toUpperCase().slice(0, 10) || `PLAYER ${this.state.players.length + 1}`;
    p.team = this.teamSize(0) <= this.teamSize(1) ? 0 : 1;
    p.builder = Object.keys(this.data.builders)[0]!;
    p.bot = false;
    p.ready = false;
    p.connected = true;
    this.applyMode(p);
    this.state.players.push(p);
    if (!this.state.host) this.state.host = client.sessionId;
    this.reportPlayers();
  }

  override async onLeave(client: Client): Promise<void> {
    this.release(client.sessionId);
    const index = this.state.players.findIndex((p) => p.sessionId === client.sessionId);
    const p = this.state.players[index];
    if (!p) return;
    if (this.inLobby()) {
      this.state.players.splice(index, 1);
      if (this.state.host === client.sessionId) this.state.host = this.state.players.find((q) => !q.bot)?.sessionId ?? '';
      this.reportPlayers();
      return;
    }
    // Mid-game: keep the seat for a while; a bot plays it meanwhile.
    p.connected = false;
    this.reportPlayers();
    try {
      await this.allowReconnection(client, 60);
      p.connected = true;
    } catch {
      p.bot = true;
    }
    this.reportPlayers();
  }

  override onDispose(): void {
    this.timer?.clear();
    if (this.counted) openRooms--;
    for (const id of [...this.ips.keys()]) this.release(id);
    // Closed while the game still ran: everyone left.
    if (this.game && this.game.phase !== 'over') monitor.gameEnded(this.roomId, { wave: this.game.wave, winner: null, abandoned: true, builders: this.builders() });
    monitor.roomDisposed(this.roomId);
  }

  /** A handler or the game loop threw: log it and end this match instead of the whole server. */
  override onUncaughtException(error: RoomException, method: string): void {
    if (error.cause instanceof ServerError) return; // our own rejections (server full, too many connections)
    log('room.error', { room: this.roomId, method, error: error.message, stack: error.stack });
    if (method === 'setInterval' && this.game) {
      this.timer?.clear();
      this.timer = null;
      this.broadcast('err', 'the match crashed, sorry');
      void this.disconnect();
    }
  }

  private release(sessionId: string): void {
    const ip = this.ips.get(sessionId);
    this.ips.delete(sessionId);
    if (!ip) return;
    const n = (connections.get(ip) ?? 1) - 1;
    if (n > 0) connections.set(ip, n);
    else connections.delete(ip);
  }

  private reportPlayers(): void {
    monitor.players(this.roomId, this.state.players.filter((p) => !p.bot && p.connected).length);
  }

  private builders(): string[] {
    return this.state.players.map((p) => p.builder);
  }

  // ---- game ----------------------------------------------------------------

  private startGame(client: Client): void {
    const players = this.state.players;
    if (this.teamSize(0) === 0 || this.teamSize(1) === 0) {
      client.send('err', 'both teams need a player or bot');
      return;
    }
    if (players.some((p) => !p.bot && !p.ready && p.sessionId !== this.state.host)) {
      client.send('err', 'not everyone is ready');
      return;
    }
    // All random: builders are only revealed when the match begins.
    if (this.state.mode === 'ar') {
      for (const p of players) p.builder = rollBuilders(rollableBuilders(this.data), 1, Math.random)[0]!;
    }
    this.game = new Game({
      seed: Math.floor(Math.random() * 2 ** 31),
      data: this.data,
      players: players.map((p, i) => ({ id: p.sessionId || `bot${i}`, name: p.name, team: p.team as TeamId, builder: p.builder })),
    });
    this.state.status = 'playing';
    monitor.gameStarted(this.roomId, {
      mode: this.state.mode,
      humans: players.filter((p) => !p.bot).length,
      bots: players.filter((p) => p.bot).length,
      builders: this.builders(),
    });
    void this.lock();
    this.syncState();
    this.timer = this.clock.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const game = this.game;
    if (!game) return;
    this.state.players.forEach((p, i) => {
      if (p.bot || !p.connected) for (const cmd of botCommands(game, i)) game.apply(cmd);
    });
    this.pending.push(...game.tick());
    this.syncState();
    monitor.wave(this.roomId, game.wave);
    if (++this.ticks % EVENT_EVERY === 0 && this.pending.length) {
      this.broadcast('ev', encodeEvents(this.pending), { afterNextPatch: true });
      this.pending = [];
    }
    if (game.phase === 'over') {
      this.state.status = 'over';
      this.timer?.clear();
      this.timer = null;
      if (this.pending.length) this.broadcast('ev', encodeEvents(this.pending), { afterNextPatch: true });
      this.pending = [];
      monitor.gameEnded(this.roomId, { wave: game.wave, winner: game.winner, abandoned: false, builders: this.builders() });
    }
  }

  /** Mirrors the simulation into the synced schema; unchanged fields cost nothing. */
  private syncState(): void {
    const game = this.game!;
    const s = this.state;
    s.phase = game.phase;
    s.wave = game.wave;
    s.timeMs = game.timeMs;
    s.phaseEndsAtMs = game.phaseEndsAtMs;
    s.winner = game.winner ?? -1;
    const levels = [game.kingLevels[0], game.kingLevels[1]].flatMap((l) => [l.hp, l.attack, l.regen]);
    levels.forEach((v, i) => {
      if (s.kingLevels[i] !== v) s.kingLevels[i] = v;
    });

    game.players.forEach((gp, i) => {
      const p = s.players[i]!;
      if (p.gold !== gp.gold) p.gold = gp.gold;
      if (p.lumber !== gp.lumber) p.lumber = gp.lumber;
      if (p.income !== gp.income) p.income = gp.income;
      if (p.workers !== gp.workers) p.workers = gp.workers;
      if (p.leaks !== gp.leaks) p.leaks = gp.leaks;
      if (p.foodCap !== gp.foodCap) p.foodCap = gp.foodCap;
      if (p.farmLevel !== gp.farmLevel) p.farmLevel = gp.farmLevel;
      if (p.rerolls !== gp.rerolls) p.rerolls = gp.rerolls;
      if (p.fighters.join() !== gp.fighters.join()) {
        p.fighters.clear();
        for (const id of gp.fighters) p.fighters.push(id);
      }
      if (p.queuedSends.join() !== gp.queuedSends.join()) {
        p.queuedSends.clear();
        for (const id of gp.queuedSends) p.queuedSends.push(id);
      }
    });

    for (const u of game.units.values()) {
      const key = String(u.id);
      let n = s.units.get(key);
      if (!n) {
        n = new NetUnit();
        n.kind = UNIT_KINDS.indexOf(u.kind);
        n.owner = u.owner;
        n.team = u.team;
        s.units.set(key, n);
      }
      const x = Math.round(u.x);
      const y = Math.round(u.y);
      if (n.def !== u.def) n.def = u.def;
      if (n.area !== u.area) n.area = u.area;
      if (n.x !== x) n.x = x;
      if (n.y !== y) n.y = y;
      if (n.hp !== u.hp) n.hp = Math.max(0, u.hp);
      if (n.maxHp !== u.maxHp) n.maxHp = u.maxHp;
      if (n.dead !== u.dead) n.dead = u.dead;
      const target = u.targetId ?? -1;
      if (n.target !== target) n.target = target;
      const col = u.cell?.col ?? -1;
      const row = u.cell?.row ?? -1;
      if (n.col !== col) n.col = col;
      if (n.row !== row) n.row = row;
      if (n.invested !== u.invested) n.invested = u.invested;
      if (n.fresh !== u.fresh) n.fresh = u.fresh;
      if (n.leaked !== u.leaked) n.leaked = u.leaked;
      if (n.modDamage !== u.mods.damage) n.modDamage = u.mods.damage;
      if (n.modArmor !== u.mods.armor) n.modArmor = u.mods.armor;
      if (n.status !== u.status) n.status = u.status;
    }
    for (const key of [...s.units.keys()]) if (!game.units.has(Number(key))) s.units.delete(key);
  }

  // ---- helpers ---------------------------------------------------------------

  /** Single draft deals each slot a fresh offer, All Prophet seats everyone as Prophet; other modes clear the offer. */
  private applyMode(p: NetPlayer): void {
    p.offer.clear();
    if (this.state.mode === 'apr') p.builder = PROPHET;
    if (this.state.mode !== 'sd') return;
    const offer = rollBuilders(rollableBuilders(this.data), DRAFT_SIZE, Math.random);
    for (const b of offer) p.offer.push(b);
    p.builder = offer[0]!;
  }

  private inLobby(): boolean {
    return this.state.status === 'lobby';
  }

  private isHost(client: Client): boolean {
    return this.state.host === client.sessionId;
  }

  private slotOf(client: Client): NetPlayer | undefined {
    return this.state.players.find((p) => p.sessionId === client.sessionId);
  }

  private teamSize(team: TeamId): number {
    return this.state.players.filter((p) => p.team === team).length;
  }
}
