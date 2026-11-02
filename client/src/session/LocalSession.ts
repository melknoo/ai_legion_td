import {
  Game,
  PROPHET,
  Rng,
  TICK_MS,
  botCommands,
  modeLocksBuilder,
  rollableBuilders,
  type Command,
  type CommandResult,
  type GameData,
  type GameEvent,
  type ModeId,
  type PlayerCommand,
  type TeamId,
} from '@legion/shared';
import type { Session } from './Session.ts';

export interface SoloConfig {
  builder: string;
  /** Players per team; bots fill every seat but the local player's. */
  teamSize: number;
  mode: ModeId;
  /** Builder of the first foe bot (showcase duels); random otherwise. */
  foe?: string;
}

export interface LocalOptions {
  seed?: number;
  /** A bot plays the local seat too (showcase clips). */
  autopilot?: boolean;
}

/** Runs the simulation in the browser: the local player plus bot allies and opponents. */
export class LocalSession implements Session {
  readonly game: Game;
  readonly localPlayer = 0;
  readonly online = false;
  private acc = 0;
  private readonly prev = new Map<number, { x: number; y: number; area: number }>();
  /** First seat a bot plays: 0 when the local seat runs on autopilot. */
  private readonly firstBot: number;

  constructor(data: GameData, config: SoloConfig, { seed = Date.now() % 100000, autopilot = false }: LocalOptions = {}) {
    this.firstBot = autopilot ? 0 : 1;
    // A seeded game rolls its builders from the seed as well, so it replays exactly.
    const rng = new Rng(seed);
    const ids = rollableBuilders(data);
    const random = () => (config.mode === 'apr' ? PROPHET : rng.pick(ids)!);
    const seat = (name: string, team: TeamId, builder = random()) => ({ id: name.toLowerCase(), name, team, builder });
    this.game = new Game({
      seed,
      data,
      players: [
        seat('You', 0, modeLocksBuilder(config.mode) ? random() : config.builder),
        ...Array.from({ length: config.teamSize - 1 }, (_, i) => seat(`Ally ${i + 1}`, 0)),
        ...Array.from({ length: config.teamSize }, (_, i) => seat(`Bot ${i + 1}`, 1, i === 0 && config.foe ? config.foe : random())),
      ],
    });
  }

  update(deltaMs: number): GameEvent[] {
    this.acc += Math.min(deltaMs, 250);
    const events: GameEvent[] = [];
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      events.push(...this.step());
    }
    return events;
  }

  /** Plays ahead without rendering until the build phase of `wave` (or the end of the game). */
  skipToWave(wave: number): void {
    const g = this.game;
    for (let i = 0; i < 400_000 && g.phase !== 'over' && !(g.wave >= wave && g.phase === 'build' && !g.arenaNext); i++) this.step();
  }

  private step(): GameEvent[] {
    for (let p = this.firstBot; p < this.game.players.length; p++) for (const cmd of botCommands(this.game, p)) this.game.apply(cmd);
    this.prev.clear();
    for (const u of this.game.units.values()) this.prev.set(u.id, { x: u.x, y: u.y, area: u.area });
    return this.game.tick();
  }

  /** Position between the last two ticks, for smooth rendering. */
  interpolated(unitId: number): { x: number; y: number } | null {
    const u = this.game.units.get(unitId);
    if (!u) return null;
    const p = this.prev.get(unitId);
    if (!p || p.area !== u.area) return { x: u.x, y: u.y };
    const a = this.acc / TICK_MS;
    return { x: p.x + (u.x - p.x) * a, y: p.y + (u.y - p.y) * a };
  }

  send(cmd: PlayerCommand): CommandResult {
    return this.game.apply({ ...cmd, player: this.localPlayer } as Command);
  }
}
