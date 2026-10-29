import type { Command, PlayerState, UnitState } from './game.ts';
import type { GameData, KingStat, Phase, TeamId, UnitDef } from './types.ts';

/**
 * Read-only view of a running game: implemented by the simulation itself and by the
 * client's mirror of server state, so rendering and HUD work the same offline and online.
 */
export interface GameView {
  readonly data: GameData;
  readonly players: readonly PlayerState[];
  readonly units: ReadonlyMap<number, UnitState>;
  readonly phase: Phase;
  readonly wave: number;
  readonly timeMs: number;
  readonly phaseEndsAtMs: number;
  readonly winner: TeamId | null;
  readonly kingLevels: Record<TeamId, Record<KingStat, number>>;
  def(unit: UnitState): UnitDef;
  arenaOf(team: TeamId): number;
  isLane(area: number): boolean;
  king(team: TeamId): UnitState;
  /** Food used by a player's fighters. */
  foodUsed(player: number): number;
  /** Area of the army-vs-army arena battles. */
  battleArena(): number;
}

/** A command as sent by a client; the server fills in which player issued it. */
export type PlayerCommand = Command extends infer C ? (C extends Command ? Omit<C, 'player'> : never) : never;
