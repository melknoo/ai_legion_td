import { ARENA, LANE, type GameView, type TeamId } from '@legion/shared';
import { SCALE } from '../layout.ts';
import { seatColor, teamColor } from '../ui/playerColors.ts';

/** Lanes and arenas in field pixels. */
export const LANE_PX = { w: LANE.width * SCALE, h: LANE.height * SCALE };
export const ARENA_PX = { w: ARENA.width * SCALE, h: ARENA.height * SCALE };
/** Field pixels above every area: a dark divider, then ground for the top row's heads and the area's name. */
export const MAP_GAP = 32;

export interface MapSlot {
  area: number;
  kind: 'lane' | 'king' | 'arena';
  /** Top left corner and size of the area in field pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: number;
  /** King arenas: whose king lives there. */
  team?: TeamId;
}

/**
 * The battlefield as one map: every lane and arena stacked top to bottom (own lanes, own king,
 * the arena battle, the foe king, foe lanes), so the camera scrolls between them. The sim keeps
 * its own coordinates per area; this only places the areas on the screen.
 */
export class FieldMap {
  readonly slots: MapSlot[] = [];
  /** Height of the whole map in field pixels. */
  height = 0;
  private readonly byArea = new Map<number, MapSlot>();

  constructor(game: GameView, me: number) {
    const myTeam = game.players[me]!.team;
    const foeTeam: TeamId = myTeam === 0 ? 1 : 0;
    const lanes = (team: TeamId) => game.players.filter((p) => p.team === team).sort((a, b) => Number(b.index === me) - Number(a.index === me) || a.index - b.index);
    const lane = (index: number) => {
      const p = game.players[index]!;
      const who = index === me ? 'YOUR' : p.team === myTeam ? 'ALLY' : 'FOE';
      const builder = game.data.builders[p.builder]?.name.toUpperCase() ?? '';
      this.add({ area: index, kind: 'lane', label: `${who} LANE - ${p.name.toUpperCase()} (${builder})`, color: seatColor(game, index, me) });
    };
    const king = (team: TeamId) => this.add({ area: game.arenaOf(team), kind: 'king', label: team === myTeam ? 'YOUR KING' : 'FOE KING', color: teamColor(team), team });
    for (const p of lanes(myTeam)) lane(p.index);
    king(myTeam);
    this.add({ area: game.battleArena(), kind: 'arena', label: `ARENA BATTLE - AFTER WAVE ${game.data.rules.arenaWaves.join(', ')}`, color: 0xe0e0f0 });
    king(foeTeam);
    for (const p of lanes(foeTeam)) lane(p.index);
  }

  private add(s: Omit<MapSlot, 'x' | 'y' | 'w' | 'h'>): void {
    const size = s.kind === 'lane' ? LANE_PX : ARENA_PX;
    // Arenas are narrower than lanes: centred, on the 16 px tile grid.
    const x = Math.round((LANE_PX.w - size.w) / 32) * 16;
    const slot = { ...s, x, y: this.height + MAP_GAP, w: size.w, h: size.h };
    this.slots.push(slot);
    this.byArea.set(s.area, slot);
    this.height = slot.y + slot.h;
  }

  slot(area: number): MapSlot {
    return this.byArea.get(area) ?? this.slots[0]!;
  }

  /** The area whose middle is closest to a field-pixel row. */
  nearest(fy: number): MapSlot {
    return this.slots.reduce((a, b) => (Math.abs(b.y + b.h / 2 - fy) < Math.abs(a.y + a.h / 2 - fy) ? b : a));
  }

  /** World units in an area -> field pixels on the map. */
  toField(area: number, x: number, y: number): { x: number; y: number } {
    const s = this.byArea.get(area);
    return { x: (s?.x ?? 0) + x * SCALE, y: (s?.y ?? 0) + y * SCALE };
  }
}
