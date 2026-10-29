import { defineRoom, defineServer } from 'colyseus';
import { ROOM_NAME, SERVER_PORT } from '@legion/shared';
import { LegionRoom } from './LegionRoom.ts';

const port = Number(process.env.PORT ?? SERVER_PORT);

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(LegionRoom),
  },
});

server.listen(port);
console.log(`Legion server listening on :${port}`);
