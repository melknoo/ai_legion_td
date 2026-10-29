import type { Command, Game } from './game.ts';
import { LANE } from './geometry.ts';
import { MELEE_RANGE } from './types.ts';

/**
 * Simple opponent: builds and upgrades between waves, buys a few wisps, sends mercs and
 * upgrades its king with spare lumber during waves. Acts once per second.
 */
export function botCommands(game: Game, player: number): Command[] {
  if (game.timeMs % 1000 !== 0) return [];
  const p = game.players[player]!;
  const own = [...game.units.values()].filter((u) => u.kind === 'fighter' && u.owner === player);
  const farm = game.data.rules.farms[p.farmLevel];
  const foodLeft = p.foodCap - game.foodUsed(player);
  // Food is the usual bottleneck: keep the lumber for the next farm once it gets tight.
  const reserve = farm && foodLeft < 4 ? farm.lumber : 0;

  if (game.phase === 'fight') {
    // A king under attack (or lagging behind the waves) gets HP before anything else.
    const king = game.king(p.team);
    const k = game.data.rules.king;
    const hpLevel = game.kingLevels[p.team].hp;
    const kingNeedsHp = (king.hp < king.maxHp * 0.7 || hpLevel < Math.floor(game.wave / 3)) && hpLevel < k.hpMax;
    if (kingNeedsHp && p.lumber >= k.upgradeLumber) return [{ type: 'upgradeKing', player, stat: 'hp' }];
    const mercs = Object.values(game.data.mercs).filter((m) => m.lumberCost * 1.5 <= p.lumber - reserve && game.wave >= (m.minWave ?? 0));
    const merc = mercs[mercs.length - 1];
    if (merc && game.wave >= 3) return [{ type: 'sendMerc', player, merc: merc.id }];
    if (p.lumber - reserve >= 200) return [{ type: 'upgradeKing', player, stat: game.wave % 2 ? 'hp' : 'attack' }];
    return [];
  }
  if (game.phase !== 'build') return [];

  if (game.wave >= 2 && p.workers < 4 && p.gold >= 150) return [{ type: 'buyWorker', player }];

  // Keep a little food headroom.
  if (farm && foodLeft < 3 && p.gold >= farm.gold && p.lumber >= farm.lumber) return [{ type: 'upgradeFarm', player }];

  // Only consider commands that fit the food cap; a refused command would block the bot every second.
  const food = (id: string) => game.data.units[id]?.food ?? 0;
  const cost = (id: string) => game.data.units[id]?.goldCost ?? 0;
  // How well a fighter's attack type suits the coming wave's armor.
  const wave = game.data.waves[game.wave - 1];
  const creep = wave ? game.data.units[wave.creep] : undefined;
  const fit = (id: string) => (creep ? game.data.damageTable[game.data.units[id]!.attack.type][creep.armorType] : 1);

  // Upgrade the fighter whose upgrade suits the wave best.
  const upgrades = own
    .map((u) => ({ u, to: game.def(u).upgradesTo?.[0] }))
    .filter((x): x is { u: (typeof own)[number]; to: string } => !!x.to && cost(x.to) <= p.gold - 40 && food(x.to) - food(x.u.def) <= foodLeft)
    .sort((a, b) => fit(b.to) - fit(a.to));
  if (upgrades[0]) return [{ type: 'upgrade', player, unitId: upgrades[0].u.id, to: upgrades[0].to }];

  // Spread gold over several fighters (the best one costing at most half the purse, rated by
  // cost and type fit); when food runs short, every slot should hold the strongest fighter.
  const affordable = p.fighters.filter((id) => cost(id) <= p.gold && food(id) <= foodLeft);
  const pool = foodLeft <= 4 ? affordable : affordable.filter((id) => cost(id) <= p.gold / 2);
  const unit = [...(pool.length ? pool : affordable)].sort((a, b) => cost(b) * fit(b) - cost(a) * fit(a))[0];
  if (!unit) return [];
  const cell = freeCell(own, game.data.units[unit]!.attack.range > MELEE_RANGE);
  return cell ? [{ type: 'build', player, unit, ...cell }] : [];
}

/** Middle rows first, so the line holds where the creeps walk. */
const ROWS = Array.from({ length: LANE.gridRows }, (_, i) => i).sort(
  (a, b) => Math.abs(a - (LANE.gridRows - 1) / 2) - Math.abs(b - (LANE.gridRows - 1) / 2),
);

/** Melee fighters hold the front columns, ranged ones stand behind them. */
function freeCell(own: { cell?: { col: number; row: number } | null }[], ranged: boolean): { col: number; row: number } | null {
  const taken = new Set(own.map((u) => `${u.cell?.col},${u.cell?.row}`));
  const cols = Array.from({ length: LANE.gridCols }, (_, i) => i);
  const order = ranged ? [...cols.slice(3), ...cols.slice(0, 3).reverse()] : cols;
  for (const col of order) for (const row of ROWS) if (!taken.has(`${col},${row}`)) return { col, row };
  return null;
}
