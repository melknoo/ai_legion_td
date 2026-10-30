import type { Room } from '@colyseus/sdk';
import { chatText, type ChatLine, type ChatScope, type LobbyMessages } from '@legion/shared';

export interface ChatEntry extends ChatLine {
  /** Sent by the local player (decided on arrival, slots shift when lobby players leave). */
  mine: boolean;
  /** `performance.now()` on arrival, for fading. */
  at: number;
}

const KEEP = 50;

/**
 * Chat history of one online room. It lives from the lobby into the game, so the lobby
 * creates it once and hands it to NetSession.
 */
export class ChatLog {
  readonly lines: ChatEntry[] = [];
  /** Bumped on every new line, so views only re-render when something changed. */
  version = 0;

  constructor(private readonly room: Room) {
    room.onMessage('chat', (line: ChatLine) => {
      const players = [...(((room.state as { players?: Iterable<{ sessionId: string }> } | undefined)?.players) ?? [])];
      const me = players.findIndex((p) => p.sessionId === room.sessionId);
      this.lines.push({ ...line, mine: line.from === me, at: performance.now() });
      if (this.lines.length > KEEP) this.lines.shift();
      this.version++;
    });
  }

  send(scope: ChatScope, raw: string): void {
    const text = chatText(raw);
    if (text) this.room.send('chat', { scope, text } satisfies LobbyMessages['chat']);
  }
}
