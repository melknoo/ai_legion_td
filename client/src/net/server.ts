import { SERVER_PORT, type RoomListing } from '@legion/shared';

/** Dev: Vite and the game server run on separate ports; hosted, the server also serves the page. */
export function serverUrl(): string {
  return import.meta.env.DEV ? `${location.protocol}//${location.hostname}:${SERVER_PORT}` : location.origin;
}

/** Open public lobbies; rejects when the server cannot be reached. */
export async function fetchRooms(): Promise<RoomListing[]> {
  const res = await fetch(`${serverUrl()}/rooms`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`rooms: ${res.status}`);
  return (await res.json()) as RoomListing[];
}
