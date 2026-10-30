import type { CommandResult, GameEvent, GameView, PlayerCommand } from '@legion/shared';
import type { ChatLog } from '../net/ChatLog.ts';

/** What the battlefield needs from a game, whether simulated locally or mirrored from the server. */
export interface Session {
  readonly game: GameView;
  readonly localPlayer: number;
  readonly online: boolean;
  /** Advances by deltaMs and returns the visual events since the last call. */
  update(deltaMs: number): GameEvent[];
  /** Smoothed render position of a unit. */
  interpolated(unitId: number): { x: number; y: number } | null;
  /** Local sessions answer immediately; online sessions report rejections later via onError. */
  send(cmd: PlayerCommand): CommandResult;
  onError?: (message: string) => void;
  /** Online only: the room's chat, carried over from the lobby. */
  readonly chat?: ChatLog;
}
