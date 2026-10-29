import {
  Game,
  PROPHET,
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
}

/** Runs the simulation in the browser: the local player plus bot allies and opponents. */
export class LocalSession implements Session {
  readonly game: Game;
  readonly localPlayer = 0;
  readonly online = false;
  private acc = 0;
  private readonly prev = new Map<number, { x: number; y: number; area: number }>();

  constructor(data: GameData, config: SoloConfig, seed = Date.now() % 100000) {
    const ids = rollableBuilders(data);
    const random = () => (config.mode === 'apr' ? PROPHET : ids[Math.floor(Math.random() * ids.length)]!);
    const seat = (name: string, team: TeamId, builder = random()) => ({ id: name.toLowerCase(), name, team, builder });
    this.game = new Game({
      seed,
      data,
      players: [
        seat('You', 0, modeLocksBuilder(config.mode) ? random() : config.builder),
        ...Array.from({ length: config.teamSize - 1 }, (_, i) => seat(`Ally ${i + 1}`, 0)),
        ...Array.from({ length: config.teamSize }, (_, i) => seat(`Bot ${i + 1}`, 1)),
      ],
    });
  }

  update(deltaMs: number): GameEvent[] {
    this.acc += Math.min(deltaMs, 250);
    const events: GameEvent[] = [];
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      for (let p = 1; p < this.game.players.length; p++) for (const cmd of botCommands(this.game, p)) this.game.apply(cmd);
      this.prev.clear();
      for (const u of this.game.units.values()) this.prev.set(u.id, { x: u.x, y: u.y, area: u.area });
      events.push(...this.game.tick());
    }
    return events;
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
