// Finds showcase seeds worth recording: plays bot-only games without rendering, exactly like
// `?showcase` does, and lists how far each seed gets.
// Run: npx tsx tools/shorts/scout.ts [builder] [vs] [size] [seeds]
//   e.g. npx tsx tools/shorts/scout.ts grove corsair 1 50
import { LEGION_DATA } from '@legion/shared';
import { LocalSession } from '../../client/src/session/LocalSession.ts';

const [builder = Object.keys(LEGION_DATA.builders)[0]!, vs, size = '1', count = '30'] = process.argv.slice(2);
const rows: string[] = [];
for (let seed = 1; seed <= Number(count); seed++) {
  const session = new LocalSession(LEGION_DATA, { builder, foe: vs || undefined, teamSize: Number(size), mode: 'ap' }, { seed, autopilot: true });
  session.skipToWave(99);
  const g = session.game;
  const builders = g.players.map((p) => p.builder).join(',');
  rows.push(`seed ${String(seed).padStart(3)}  last wave ${String(g.wave).padStart(2)}  winner ${g.winner ?? '-'}  ${builders}`);
}
console.log(rows.join('\n'));
