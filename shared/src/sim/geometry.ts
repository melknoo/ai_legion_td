// Side-view layout: creeps spawn on the left and walk right through the build grid.
// Anything reaching leakX leaks to the team's king arena.

export const CELL = 64;

export const LANE = {
  width: 1600,
  height: 320,
  spawnMinX: 32,
  spawnMaxX: 160,
  gridX: 832,
  gridCols: 10,
  gridRows: 5,
  leakX: 1568,
} as const;

export const ARENA = {
  width: 960,
  height: 320,
  entryX: 32,
  kingX: 800,
  kingY: 160,
} as const;

export function cellCenter(col: number, row: number): { x: number; y: number } {
  return { x: LANE.gridX + col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function isValidCell(col: number, row: number): boolean {
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col < LANE.gridCols && row < LANE.gridRows;
}
