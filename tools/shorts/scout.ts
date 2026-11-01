// Finds showcase seeds worth recording: plays bot-only games without rendering, exactly like
// `?showcase` does, and lists how far each seed gets and how lane 0 fared against the bosses.
// Run: npx tsx tools/shorts/scout.ts [builder] [vs] [size] [seeds]
//   e.g. npx tsx tools/shorts/scout.ts grove corsair 1 50
import { LEGION_DATA, TICK_MS } from '@legion/shared';
import { LocalSession } from '../../client/src/session/LocalSession.ts';

const [builder = Object.keys(LEGION_DATA.builders)[0]!, vs, size = '1', count = '30'] = process.argv.slice(2);
const BOSS_WAVES = [10, 20, 30];
const rows: string[] = [];
for (let seed = 1; seed <= Number(count); seed++) {
  const session = new LocalSession(LEGION_DATA, { builder, foe: vs || undefined, teamSize: Number(size), mode: 'ap' }, { seed, autopilot: true });
  const g = session.game;
  // Per boss wave: did a boss leak from lane 0, and how many creeps leaked there in total.
  const bosses = new Map<number, { leakedBoss: boolean; leaks: number }>();
  while (g.phase !== 'over' && g.wave <= 30) {
    const wave = g.wave;
    for (const ev of session.update(TICK_MS)) {
      if (ev.type !== 'leak' || ev.player !== 0 || !BOSS_WAVES.includes(wave)) continue;
      const unit = g.units.get(ev.unitId);
      const entry = bosses.get(wave) ?? { leakedBoss: false, leaks: 0 };
      entry.leaks++;
      if (unit && g.def(unit).boss) entry.leakedBoss = true;
      bosses.set(wave, entry);
    }
  }
  const boss = BOSS_WAVES.filter((w) => w < g.wave || (w === g.wave && g.phase === 'over'))
    .map((w) => `b${w}:${bosses.get(w)?.leakedBoss ? 'LEAK' : 'held'}${bosses.get(w)?.leaks ? `(${bosses.get(w)!.leaks})` : ''}`)
    .join(' ');
  const builders = g.players.map((p) => p.builder).join(',');
  rows.push(`seed ${String(seed).padStart(3)}  last wave ${String(g.wave).padStart(2)}  winner ${g.winner ?? '-'}  ${builders.padEnd(22)} ${boss}`);
}
console.log(rows.join('\n'));
