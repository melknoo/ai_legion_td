/**
 * Desktop app (Electron, `desktop/`): the client is built with `vite build --mode desktop` and
 * served from `app://legion/`. The preload script hands over a small bridge as `window.legionDesktop`.
 */
export const DESKTOP = import.meta.env.MODE === 'desktop';

interface DesktopBridge {
  /** `--server=URL` from the command line; overrides the address chosen in the options. */
  serverOverride: string | null;
  version: string;
  /** Window state, kept current by the main process (F11 / Alt+Enter toggle it too). */
  isFullscreen(): boolean;
  setFullscreen(on: boolean): void;
}

export const desktop: DesktopBridge | null = DESKTOP ? ((window as { legionDesktop?: DesktopBridge }).legionDesktop ?? null) : null;
