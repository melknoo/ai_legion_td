// Plays campaign runs headless: the bot fights every node, simple rules pick path, drafts and shop.
// Use it to check whether an act is beatable and to tune income, prices and elite affixes.
// Run: npx tsx tools/campaign/sim.ts [builder|all] [seeds]
//   e.g. npx tsx tools/campaign/sim.ts all 5
// --trace adds a line per fight (waves, leaks, army, gold left) to see where a run breaks.
// --bot lets the plain classic bot build and takes the dearest draft option.
import {
  Game,
  LANE,
  LEGION_DATA as D,
  MELEE_RANGE,
  botCommands,
  campaignBuilders,
  chooseReward,
  currentNode,
  enterNode,
  finishBattle,
  kingMax,
  leaveShop,
  newRun,
  nodeBattle,
  reachable,
  rest,
  shopBuy,
  type Command,
  type MapNode,
  type RunState,
} from '@legion/shared';

const TRACE = process.argv.includes('--trace');
const PLAIN_BOT = process.argv.includes('--bot');
const [which = 'all', count = '5'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const builders = which === 'all' ? campaignBuilders(D) : [which];

const hpShare = (run: RunState) => run.army.king.hp / kingMax(run, D);
const cost = (id: string) => D.units[id]?.goldCost ?? 0;

function choosePath(run: RunState): MapNode {
  const options = reachable(run);
  const hurt = hpShare(run) < 0.5;
  const score = (n: MapNode) =>
    ({ battle: 3, elite: hurt ? 0 : 4, treasure: 3.5, shop: hurt ? 5 : 2, rest: hurt ? 6 : 1, boss: 9 })[n.kind];
  return options.reduce((a, b) => (score(b) > score(a) ? b : a));
}

const ranged = (id: string) => D.units[id]!.attack.range > MELEE_RANGE;
const ROWS = Array.from({ length: LANE.gridRows }, (_, i) => i).sort((a, b) => Math.abs(a - (LANE.gridRows - 1) / 2) - Math.abs(b - (LANE.gridRows - 1) / 2));

/**
 * The classic bot, except for what it builds: it only looks at cost and type fit, which with a
 * small roster ends in armies of archers alone. Here archers never get more gold than the front,
 * as a player would do. (--bot plays the plain bot.)
 */
function playerCommands(g: Game): Command[] {
  const cmds = botCommands(g, 0);
  const build = cmds[0];
  if (PLAIN_BOT || build?.type !== 'build') return cmds;
  const me = g.players[0]!;
  const own = [...g.units.values()].filter((u) => u.kind === 'fighter');
  const spent = (shoots: boolean) => own.filter((u) => ranged(u.def) === shoots).reduce((sum, u) => sum + cost(u.def), 0);
  // The bot's pick stands unless it is an archer the front can't cover yet.
  if (!ranged(build.unit) || spent(true) + cost(build.unit) <= spent(false)) return cmds;
  const foodLeft = me.foodCap - g.foodUsed(0);
  const creep = D.units[g.data.waves[g.wave - 1]?.creep ?? ''];
  const fit = (id: string) => (creep ? g.data.damageTable[D.units[id]!.attack.type][creep.armorType] : 1);
  const options = me.fighters.filter((id) => !ranged(id) && cost(id) <= me.gold && (D.units[id]!.food ?? 0) <= foodLeft);
  const unit = options.sort((a, b) => cost(b) * fit(b) - cost(a) * fit(a))[0];
  if (!unit) return cmds;
  const taken = new Set(own.map((u) => `${u.cell?.col},${u.cell?.row}`));
  for (let col = 0; col < LANE.gridCols; col++)
    for (const row of ROWS) if (!taken.has(`${col},${row}`)) return [{ type: 'build', player: 0, unit, col, row }];
  return cmds;
}

function fight(run: RunState): { run: RunState; lastWave: number } {
  const b = nodeBattle(run, D)!;
  const g = new Game({ seed: b.seed, data: b.data, players: [{ id: 'bot', name: 'Bot', team: 0, builder: run.builder }], campaign: b.campaign });
  for (let i = 0; i < 200_000 && g.phase !== 'over'; i++) {
    for (const cmd of playerCommands(g)) g.apply(cmd);
    g.tick();
  }
  const won = g.winner === 0;
  if (TRACE) {
    const me = g.players[0]!;
    const army = [...g.units.values()].filter((u) => u.kind === 'fighter');
    const names = new Map<string, number>();
    for (const u of army) names.set(u.def, (names.get(u.def) ?? 0) + 1);
    console.log(
      `    ${b.node.kind.padEnd(6)} waves ${b.campaign.firstWave}-${b.campaign.lastWave}${b.campaign.affix ? ' +affix' : ''}  ${won ? 'ok  ' : 'LOST'} at wave ${g.wave}` +
        `  leaks ${me.leaks}  gold ${me.gold}  lumber ${me.lumber}  food ${g.foodUsed(0)}/${me.foodCap}  ` +
        [...names].map(([id, n]) => `${n}x ${id}`).join(', '),
    );
  }
  return { run: finishBattle(run, D, { won, state: won ? g.campaignState() : undefined, leaks: g.players[0]!.leaks }), lastWave: g.wave };
}

function playRun(builder: string, seed: number): string {
  let run = newRun(D, seed, builder);
  let lastWave = 0;
  let bossHp = 0;
  for (let step = 0; step < 200; step++) {
    if (run.status === 'won' || run.status === 'lost') break;
    if (run.status === 'map') {
      const node = choosePath(run);
      if (node.kind === 'boss') bossHp = hpShare(run);
      run = enterNode(run, D, node.id);
    } else if (run.status === 'battle') {
      ({ run, lastWave } = fight(run));
    } else if (run.status === 'reward') {
      const reward = run.rewards[0]!;
      if (reward.kind === 'relic') run = chooseReward(run, D, 0);
      else {
        const fighters = run.army.players[0]!.fighters;
        // The dearest option, but a one-sided roster takes the other kind first (archers alone leak from wave 1).
        const need = PLAIN_BOT ? undefined : fighters.every(ranged) ? false : fighters.some(ranged) ? undefined : true;
        const rate = (id: string) => cost(id) + (need !== undefined && ranged(id) === need ? 1000 : 0);
        const best = reward.options.reduce((bi, id, i) => (rate(id) > rate(reward.options[bi]!) ? i : bi), 0);
        const cheapest = fighters.length ? fighters.reduce((a, b) => (cost(b) < cost(a) ? b : a)) : undefined;
        run = chooseReward(run, D, best, cheapest);
      }
    } else if (run.status === 'shop') {
      const lumber = run.army.players[0]!.lumber;
      const buy = run.shop.findIndex((o) => !o.sold && o.price <= lumber && (o.kind === 'relic' || (o.kind === 'heal' && hpShare(run) < 0.7)));
      run = buy >= 0 ? shopBuy(run, D, buy) : leaveShop(run);
    } else if (run.status === 'rest') {
      run = rest(run, D, hpShare(run) < 0.7 ? 'heal' : 'train');
    }
  }
  const node = currentNode(run);
  const me = run.army.players[0]!;
  return [
    builder.padEnd(10),
    `seed ${String(seed).padStart(3)}`,
    run.status.toUpperCase().padEnd(4),
    `row ${node?.row ?? 0} (${node?.kind ?? '-'})`.padEnd(16),
    `wave ${lastWave}`.padEnd(8),
    `king ${Math.round(hpShare(run) * 100)}%`.padEnd(10),
    `boss-entry ${bossHp ? Math.round(bossHp * 100) + '%' : '-'}`.padEnd(16),
    `leaks ${run.stats.leaks}`.padEnd(10),
    `roster ${me.fighters.length} units ${run.army.units.length} relics ${run.relics.length}`,
  ].join(' ');
}

let won = 0;
let total = 0;
for (const builder of builders) {
  for (let seed = 1; seed <= Number(count); seed++) {
    const line = playRun(builder, seed);
    total++;
    if (line.includes(' WON ')) won++;
    console.log(line);
  }
}
console.log(`\n${won}/${total} runs won (${Math.round((won / total) * 100)}%)`);
