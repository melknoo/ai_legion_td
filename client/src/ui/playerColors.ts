import type { TeamId } from '@legion/shared';

/** Team names and colours as in the lobby: WEST is blue, EAST is red. */
export const TEAM_NAMES = ['WEST', 'EAST'] as const;
const TEAM_COLORS = [0x80b0ff, 0xff8080] as const;
/** The local player stands out in gold everywhere: rings, labels, summaries, chat. */
export const ME_COLOR = 0xffd040;

export function teamColor(team: TeamId): number {
  return TEAM_COLORS[team];
}

/** Colour for a seat as seen by the local player: gold for yourself, else the seat's team colour. */
export function seatColor(game: { players: readonly { team: TeamId }[] }, seat: number, me: number): number {
  return seat === me ? ME_COLOR : teamColor(game.players[seat]?.team ?? 0);
}
