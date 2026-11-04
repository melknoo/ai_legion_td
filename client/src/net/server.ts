import { SERVER_PORT, type RoomListing } from '@legion/shared';
import { DESKTOP, desktop } from '../desktop.ts';
import { settings } from '../settings.ts';

/** The hosted game; the desktop app connects here unless another server is set. */
export const OFFICIAL_SERVER = 'https://legion.schleiweb.de';

/**
 * Dev: Vite and the game server run on separate ports; hosted, the server also serves the page.
 * Desktop: `--server=URL`, else the address from the options, else the official server.
 */
export function serverUrl(): string {
  if (DESKTOP) return desktop?.serverOverride || settings().server || OFFICIAL_SERVER;
  return import.meta.env.DEV ? `${location.protocol}//${location.hostname}:${SERVER_PORT}` : location.origin;
}

/** Base for invite links: the page players open in a browser (the desktop app's own origin is `app://`). */
export function publicUrl(): string {
  return DESKTOP ? serverUrl() : `${location.origin}${location.pathname}`;
}

/**
 * Turns what the player typed ("192.168.1.5", "localhost:2567", "https://example.org/") into a
 * server URL; empty for the official server, null when it is not an http(s) address.
 */
export function normalizeServer(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\/+$/, '');
  if (!s) return '';
  const withScheme = /^https?:\/\//.test(s) ? s : `${/^(localhost|[\d.]+)(:|$)/.test(s) ? 'http' : 'https'}://${s}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname !== 'localhost' && !url.hostname.includes('.')) return null;
    // The official server is the default; storing it would pin today's address.
    return url.origin === OFFICIAL_SERVER ? '' : url.origin;
  } catch {
    return null;
  }
}

/** Open public lobbies; rejects when the server cannot be reached. */
export async function fetchRooms(): Promise<RoomListing[]> {
  const res = await fetch(`${serverUrl()}/rooms`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`rooms: ${res.status}`);
  return (await res.json()) as RoomListing[];
}
