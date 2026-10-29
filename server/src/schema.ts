import { schema, t, type SchemaType } from '@colyseus/schema';

/** One unit as clients see it. Colyseus only transmits fields that changed. */
export const NetUnit = schema(
  {
    def: t.string(),
    kind: t.uint8(),
    owner: t.int8(),
    team: t.uint8(),
    area: t.uint8(),
    x: t.int16(),
    y: t.int16(),
    hp: t.float32(),
    maxHp: t.uint32(),
    dead: t.boolean(),
    target: t.int32(),
    col: t.int8(),
    row: t.int8(),
    invested: t.uint16(),
    fresh: t.boolean(),
    leaked: t.boolean(),
    modDamage: t.int16(),
    modArmor: t.int16(),
    /** STATUS debuff flags, for tinting. */
    status: t.uint8(),
  },
  'NetUnit',
);
export type NetUnit = SchemaType<typeof NetUnit>;

/** A lobby slot (human or bot); once the game runs, also that player's economy. */
export const NetPlayer = schema(
  {
    sessionId: t.string(),
    name: t.string(),
    team: t.uint8(),
    builder: t.string(),
    /** Single draft: the builders this player may choose from. */
    offer: t.array('string'),
    ready: t.boolean(),
    bot: t.boolean(),
    connected: t.boolean(),
    gold: t.uint32(),
    lumber: t.uint32(),
    income: t.uint16(),
    workers: t.uint8(),
    leaks: t.uint16(),
    foodCap: t.uint8(),
    farmLevel: t.uint8(),
  },
  'NetPlayer',
);
export type NetPlayer = SchemaType<typeof NetPlayer>;

export const NetState = schema(
  {
    /** lobby | playing | over */
    status: t.string(),
    host: t.string(),
    /** Builder selection mode: ap | ar | sd. */
    mode: t.string(),
    /** Slot order is the player index in the game. */
    players: t.array(NetPlayer),
    units: t.map(NetUnit),
    phase: t.string(),
    wave: t.uint8(),
    timeMs: t.uint32(),
    phaseEndsAtMs: t.uint32(),
    winner: t.int8(),
    /** King upgrade levels: [team0 hp, attack, regen, team1 hp, attack, regen]. */
    kingLevels: t.array('uint8'),
  },
  'NetState',
);
export type NetState = SchemaType<typeof NetState>;
