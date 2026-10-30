import { MELEE_RANGE, type AttackType, type GameData, type UnitDef } from '@legion/shared';
import type { FxKey, ProjKey } from '../assets/manifest.ts';

/** What flies (ranged only) and what flashes on the target. */
export interface AttackStyle {
  /** Projectile strip, or an image: 'arrow' / 'kunai'. */
  shot?: ProjKey | 'arrow' | 'kunai';
  /** Effect on the target: on the hit for melee, where the projectile lands for ranged. */
  impact?: FxKey;
  /** Multiply tint on the projectile (recolours shared strips per builder). */
  tint?: number;
}

/**
 * A builder's look: melee hit, physical shot (normal/pierce), spell (magic/chaos) with its
 * landing effect. Siege always lobs a cannonball. Unset parts fall back to the attack type.
 */
interface Theme {
  melee: FxKey;
  shot?: AttackStyle;
  spell?: AttackStyle;
}

const THEMES: Record<string, Theme> = {
  clockwork: { melee: 'cut', shot: { shot: 'kunai' }, spell: { shot: 'energy', impact: 'spark', tint: 0xffe080 } },
  feral: { melee: 'claw', shot: { shot: 'rock', impact: 'rock' }, spell: { shot: 'energy', impact: 'magic', tint: 0xc0ff80 } },
  umbral: { melee: 'clawdouble', shot: { shot: 'energy', impact: 'spirit', tint: 0xb070ff }, spell: { shot: 'energy', impact: 'spirit', tint: 0x9040ff } },
  grove: { melee: 'slashcurved', shot: { shot: 'plantspike', impact: 'plant' }, spell: { shot: 'energy', impact: 'plant', tint: 0x90ff90 } },
  primal: { melee: 'rock', spell: { shot: 'energy', impact: 'magic' } },
  spectral: { melee: 'spirit', shot: { shot: 'energy', impact: 'spirit', tint: 0xc0f0ff }, spell: { shot: 'energy', impact: 'spirit', tint: 0x80e0ff } },
  wildfolk: { melee: 'cutx', shot: { shot: 'shuriken' }, spell: { shot: 'energy', impact: 'plant', tint: 0x90ffb0 } },
  tidal: { melee: 'water', shot: { shot: 'icespike', impact: 'water', tint: 0x70b0ff }, spell: { shot: 'energy', impact: 'water', tint: 0x60a0ff } },
  frost: { melee: 'ice', shot: { shot: 'icespike', impact: 'ice' }, spell: { shot: 'icespike', impact: 'frost' } },
  sylvan: { melee: 'slashcurved', shot: { shot: 'arrow', impact: 'plant' }, spell: { shot: 'energy', impact: 'plant', tint: 0xe0ffa0 } },
  tinker: { melee: 'explosion', shot: { shot: 'kunai', impact: 'spark' } },
  order: { melee: 'slashcurved', shot: { shot: 'arrow' }, spell: { shot: 'energy', impact: 'holy', tint: 0xfff0a0 } },
  warclan: { melee: 'cutdouble', shot: { shot: 'rock', impact: 'cutdouble' }, spell: { shot: 'fireball', impact: 'flame' } },
  crypt: { melee: 'clawdouble', shot: { shot: 'rock', impact: 'spirit', tint: 0xe0e0c0 }, spell: { shot: 'energy', impact: 'spirit', tint: 0x80ff80 } },
  abyss: { melee: 'clawdouble', shot: { shot: 'plantspike', impact: 'spirit', tint: 0xd080ff }, spell: { shot: 'fireball', impact: 'flame', tint: 0xd060ff } },
  corsair: { melee: 'cutx', shot: { shot: 'kunai' }, spell: { shot: 'fireball', impact: 'flame' } },
  forge: { melee: 'rock', shot: { shot: 'rock', impact: 'rock' }, spell: { shot: 'energy', impact: 'thunder', tint: 0xa0c0ff } },
  canopy: { melee: 'claw', shot: { shot: 'plantspike', impact: 'plant' }, spell: { shot: 'energy', impact: 'plant', tint: 0x80ff60 } },
};

/** Fighters that stand out from their builder's theme (the elementals are one element each). */
const OVERRIDES: Record<string, AttackStyle> = {
  sparkmote: { shot: 'fireball', impact: 'flame' },
  'cinder-sibyl': { shot: 'fireball', impact: 'explosion' },
  tidewisp: { shot: 'energy', impact: 'water', tint: 0x60a0ff },
  breezeling: { shot: 'shuriken', impact: 'slash' },
  claybrute: { impact: 'rockspike' },
  'storm-engine': { shot: 'energy', impact: 'thunder', tint: 0xa0c0ff },
  'thunder-thane': { shot: 'energy', impact: 'thunder', tint: 0xa0c0ff },
  'magma-bosun': { impact: 'flame' },
  'pop-mine': { impact: 'explosion' },
  ashcaller: { shot: 'fireball', impact: 'flame' },
};

/** The style every unit without a builder (creeps, sends) uses: by attack type, as before. */
function byType(type: AttackType, ranged: boolean): AttackStyle {
  if (!ranged) return { impact: 'cut' };
  if (type === 'siege') return { shot: 'cannon', impact: 'explosion' };
  if (type === 'magic') return { shot: 'energy' };
  if (type === 'chaos') return { shot: 'fireball' };
  return { shot: 'arrow' };
}

let builderOf: Map<string, string> | undefined;

/** Fighter id → builder id, following each builder's upgrade chains. */
function builderIndex(data: GameData): Map<string, string> {
  if (builderOf) return builderOf;
  builderOf = new Map();
  for (const b of Object.values(data.builders)) {
    const todo = [...b.fighters];
    while (todo.length) {
      const id = todo.pop()!;
      if (builderOf.has(id)) continue;
      builderOf.set(id, b.id);
      todo.push(...(data.units[id]?.upgradesTo ?? []));
    }
  }
  return builderOf;
}

export function attackStyle(data: GameData, def: UnitDef): AttackStyle {
  const ranged = def.attack.range > MELEE_RANGE;
  const base = byType(def.attack.type, ranged);
  const theme = THEMES[builderIndex(data).get(def.id) ?? ''];
  if (!theme) return base;
  const spell = def.attack.type === 'magic' || def.attack.type === 'chaos';
  const themed: AttackStyle = !ranged
    ? { impact: theme.melee }
    : def.attack.type === 'siege'
      ? { shot: 'cannon', impact: 'explosion' }
      : ((spell ? theme.spell : theme.shot) ?? base);
  return { ...base, ...themed, ...OVERRIDES[def.id] };
}
