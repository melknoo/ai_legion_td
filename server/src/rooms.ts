import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchMaker } from 'colyseus';
import { MAX_TEAM_SIZE, ROOM_NAME, type RoomListing, type RoomMeta } from '@legion/shared';

/** Rows the game list gets at most. */
const MAX_LISTED = 20;

/** Open public lobbies with a free slot; only the fields we set ourselves leave the server. */
async function listRooms(res: ServerResponse): Promise<void> {
  const rooms = await matchMaker.query({ name: ROOM_NAME, private: false, locked: false });
  const max = MAX_TEAM_SIZE * 2;
  const list: RoomListing[] = rooms
    .map((r) => ({ id: r.roomId, meta: r.metadata as Partial<RoomMeta> | undefined }))
    .filter(({ meta }) => meta?.title && (meta.players ?? max) < max)
    .slice(0, MAX_LISTED)
    .map(({ id, meta }) => ({ id, title: meta!.title!, mode: meta!.mode ?? 'ap', players: meta!.players!, max }));
  // CORS for the dev page on Vite's port comes from Colyseus' own headers.
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(list));
}

/** Express-style middleware for GET /rooms; everything else passes on. */
export function roomRoutes() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '/').split('?')[0];
    if (url !== '/rooms' || req.method !== 'GET') return next();
    listRooms(res).catch(() => {
      res.writeHead(500).end();
    });
  };
}
