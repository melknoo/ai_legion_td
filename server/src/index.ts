import { defineRoom, defineServer } from 'colyseus';
import { ROOM_NAME, SERVER_PORT } from '@legion/shared';
import { LegionRoom } from './LegionRoom.ts';
import { serveClient } from './static.ts';

const port = Number(process.env.PORT ?? SERVER_PORT);
// Hosting: CLIENT_DIR points at the built client, so page and game share one port.
const clientDir = process.env.CLIENT_DIR;

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(LegionRoom),
  },
  ...(clientDir ? { express: (app) => void app.use(serveClient(clientDir)) } : {}),
});

server.listen(port);
console.log(`Legion server listening on :${port}${clientDir ? ` (serving ${clientDir})` : ''}`);
