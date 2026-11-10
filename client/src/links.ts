import { DESKTOP, desktop } from './desktop.ts';
import { OFFICIAL_SERVER } from './net/server.ts';

/** Where players report bugs and ideas. Swap in the Discord invite once there is one. */
export const FEEDBACK_URL = 'https://github.com/melknoo/ai_legion_td/issues/new';

/** Imprint and privacy notice: a static page next to the game (the desktop app opens the hosted one). */
export const LEGAL_URL = DESKTOP ? `${OFFICIAL_SERVER}/legal.html` : '/legal.html';

export const VERSION = `V${desktop?.version ?? __APP_VERSION__}`;

/** Opens a page outside the game (a new tab; the desktop app hands it to the system browser). */
export function openLink(url: string): void {
  window.open(url, '_blank', 'noopener');
}
