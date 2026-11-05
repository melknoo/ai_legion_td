import { describe, expect, it } from 'vitest';
import { LEGION_DATA, PROPHET } from '../data/legion.ts';
import { botCommands } from './bot.ts';
import { Game, type PlayerConfig } from './game.ts';

/**
 * Golden test for the classic modes: fixed bot games must replay bit for bit.
 * The campaign adds optional hooks to the sim; this guards that games without them are untouched.
 * Update the hashes only for a deliberate change to classic play (balance, rules, sim fixes).
 */

function fnv(hash: number, text: string): number {
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

function playClassic(seed: number, players: PlayerConfig[], untilWave: number, data = LEGION_DATA): string {
  const g = new Game({ seed, data, players });
  let hash = 0x811c9dc5;
  for (let i = 0; i < 60_000 && g.phase !== 'over' && g.wave <= untilWave; i++) {
    for (let p = 0; p < players.length; p++) for (const cmd of botCommands(g, p)) g.apply(cmd);
    hash = fnv(hash, JSON.stringify(g.tick()));
  }
  hash = fnv(hash, JSON.stringify([...g.units.values()]));
  hash = fnv(hash, JSON.stringify([g.players, g.wave, g.timeMs, g.phase, g.winner, g.kingLevels]));
  return `${g.wave}/${g.timeMs}/${hash.toString(16)}`;
}

const seat = (i: number, team: 0 | 1, builder: string): PlayerConfig => ({ id: `p${i}`, name: `P${i}`, team, builder });

describe('classic golden games', () => {
  it('1v1 bots replay identically', () => {
    expect(playClassic(11, [seat(0, 0, 'grove'), seat(1, 1, 'frost')], 12)).toBe('6/502000/ce4d1c1a');
  });

  it('2v2 bots with prophet and chimera replay identically', () => {
    expect(playClassic(23, [seat(0, 0, PROPHET), seat(1, 0, 'chimera'), seat(2, 1, 'warclan'), seat(3, 1, 'tidal')], 12)).toBe('7/565650/74d05174');
  });

  it('a long 1v1 through the wave-10 arena replays identically', () => {
    // Bots rarely survive to the arena: tough kings keep the game going past wave 10.
    const data = { ...LEGION_DATA, units: { ...LEGION_DATA.units, king: { ...LEGION_DATA.units.king!, hp: 1e7 } } };
    expect(playClassic(5, [seat(0, 0, 'forge'), seat(1, 1, 'sylvan')], 12, data)).toBe('13/1475500/da0850e');
  });
});
