// End-to-end smoke test against a running server: join, add a bot, start, and watch
// state patches and event batches arrive. Usage: npx tsx scripts/smoke.ts
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, SERVER_PORT, decodeEvents } from '@legion/shared';

const client = new Client(`http://localhost:${SERVER_PORT}`);
const room = await client.create(ROOM_NAME, { name: 'smoke', fast: true });
console.log('joined room', room.roomId, 'as', room.sessionId);

let events = 0;
let patches = 0;
room.onMessage('ev', (wire: number[][]) => (events += decodeEvents(wire).length));
room.onMessage('err', (msg: string) => console.log('server error:', msg));
room.onStateChange(() => patches++);

room.send('addBot', 1);
await new Promise((r) => setTimeout(r, 300));
room.send('start', null);
room.send('cmd', { type: 'build', unit: 'cogling', col: 0, row: 2 });

await new Promise((r) => setTimeout(r, 12_000));
const s = room.state as any;
console.log({
  status: s.status,
  phase: s.phase,
  wave: s.wave,
  players: s.players.map((p: any) => ({ name: p.name, team: p.team, bot: p.bot, gold: p.gold })),
  units: s.units.size,
  patches,
  events,
});
await room.leave();
process.exit(0);
