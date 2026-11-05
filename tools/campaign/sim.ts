// Plays campaign runs headless: the bot fights every node, simple rules pick path, drafts and shop.
// Use it to check whether an act is beatable and to tune income, prices and elite affixes.
// Run: npx tsx tools/campaign/sim.ts [builder|all] [seeds]
//   e.g. npx tsx tools/campaign/sim.ts all 5
import {
  Game,
  LEGION_DATA as D,
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
  type MapNode,
  type RunState,
} from '@legion/shared';

const [which = 'all', count = '5'] = process.argv.slice(2);
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

function fight(run: RunState): { run: RunState; lastWave: number } {
  const b = nodeBattle(run, D)!;
  const g = new Game({ seed: b.seed, data: b.data, players: [{ id: 'bot', name: 'Bot', team: 0, builder: run.builder }], campaign: b.campaign });
  for (let i = 0; i < 200_000 && g.phase !== 'over'; i++) {
    for (const cmd of botCommands(g, 0)) g.apply(cmd);
    g.tick();
  }
  const won = g.winner === 0;
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
        const best = reward.options.reduce((bi, id, i) => (cost(id) > cost(reward.options[bi]!) ? i : bi), 0);
        const fighters = run.army.players[0]!.fighters;
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
