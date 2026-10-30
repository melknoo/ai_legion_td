import type { GameView } from '@legion/shared';
import type { SoloConfig } from './session/LocalSession.ts';

// Solo games run in the browser, so production builds tell the game server (/solo) when one
// starts, reaches a wave and ends; its stats page lists them next to the online games.
// Offline (installed app without a connection) the reports just fail.

/** Reports one solo game; `end` sends at most once, whether the game finished or was left. */
export class SoloReport {
  private readonly id = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
  private done = false;
  private readonly onHide = () => this.end(null, true);

  constructor(
    private readonly game: GameView,
    private readonly config: SoloConfig,
  ) {
    if (!import.meta.env.PROD) return;
    this.send('start');
    window.addEventListener('pagehide', this.onHide);
  }

  wave(): void {
    this.send('wave');
  }

  /** The game is over (winner) or the player left it (abandoned: menu, play again, closed tab). */
  end(winner: number | null, abandoned: boolean): void {
    if (this.done) return;
    this.send('end', { winner, abandoned });
    this.done = true;
    window.removeEventListener('pagehide', this.onHide);
  }

  private send(event: 'start' | 'wave' | 'end', extra: Record<string, unknown> = {}): void {
    if (!import.meta.env.PROD || this.done) return;
    const g = this.game;
    const body = JSON.stringify({
      id: this.id,
      event,
      mode: this.config.mode,
      size: this.config.teamSize,
      builders: g.players.map((p) => p.builder),
      wave: g.wave,
      timeMs: Math.round(g.timeMs),
      ...extra,
    });
    fetch('/solo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {
      // Offline or no server: the game doesn't depend on it.
    });
  }
}
