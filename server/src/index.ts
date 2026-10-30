import { defineRoom, defineServer } from 'colyseus';
import { ROOM_NAME, SERVER_PORT } from '@legion/shared';
import { LegionRoom } from './LegionRoom.ts';
import { log, monitorRoutes } from './monitor.ts';
import { roomRoutes } from './rooms.ts';
import { serveClient } from './static.ts';

const port = Number(process.env.PORT ?? SERVER_PORT);
// Hosting: CLIENT_DIR points at the built client, so page and game share one port.
const clientDir = process.env.CLIENT_DIR;

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(LegionRoom),
  },
  express: (app) => {
    app.use(monitorRoutes());
    app.use(roomRoutes());
    if (clientDir) app.use(serveClient(clientDir));
  },
});

server.listen(port);
log('server.start', { port, clientDir: clientDir ?? null });
process.on('uncaughtException', (err) => {
  log('server.crash', { error: err.message, stack: err.stack });
  process.exit(1);
});
