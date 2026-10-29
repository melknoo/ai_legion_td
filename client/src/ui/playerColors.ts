/** One colour per seat, WC3-style: red, blue, teal, purple, yellow, orange, green, pink. */
export const PLAYER_COLORS = [0xff3030, 0x3070ff, 0x30e0c0, 0xa040ff, 0xffe030, 0xff9020, 0x40d040, 0xff70c0] as const;

export function playerColor(index: number): number {
  return PLAYER_COLORS[index % PLAYER_COLORS.length]!;
}
