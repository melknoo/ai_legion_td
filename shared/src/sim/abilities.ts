/** Stats an aura can change for every unit around its carrier. */
export type AuraStat = 'damage' | 'armor' | 'attackSpeed' | 'regen';

/**
 * Data-driven ability building blocks. Units list one or more; the simulation applies
 * them on attack, on hit, every tick (auras) or on a cooldown (heal, nova).
 */
export type AbilityEffect =
  /** `amount`: fraction for damage/attackSpeed, flat for armor/regen; `enemies` makes it a debuff. */
  | { kind: 'aura'; stat: AuraStat; amount: number; radius: number; enemies?: boolean }
  /** Enemies near the target take `ratio` of the hit. */
  | { kind: 'splash'; radius: number; ratio: number }
  /** Each attack also strikes up to `targets` more enemies in range for `ratio` damage. */
  | { kind: 'multishot'; targets: number; ratio: number }
  | { kind: 'crit'; chance: number; multiplier: number }
  /** Heals the attacker by `ratio` of damage dealt. */
  | { kind: 'lifesteal'; ratio: number }
  /** Melee attackers take back `ratio` of the damage they deal. */
  | { kind: 'thorns'; ratio: number }
  | { kind: 'poison'; dps: number; durationMs: number }
  /** Cuts the target's move and attack speed by `amount` (fraction). */
  | { kind: 'slow'; amount: number; durationMs: number }
  | { kind: 'stun'; chance: number; durationMs: number }
  | { kind: 'armorBreak'; amount: number; durationMs: number }
  /** Heals the most hurt ally in `radius` by up to `amount` every `cooldownMs`. */
  | { kind: 'heal'; amount: number; radius: number; cooldownMs: number }
  /** Damages every enemy in `radius` every `cooldownMs` while enemies are near. */
  | { kind: 'nova'; damage: number; radius: number; cooldownMs: number };

export type AbilityDef = AbilityEffect & { name: string };

/** Timed debuffs abilities leave on a unit. */
export type BuffKind = 'poison' | 'slow' | 'stun' | 'armorBreak';

export interface Buff {
  kind: BuffKind;
  amount: number;
  untilMs: number;
  sourceId: number;
  /** Poison: when it deals damage next. */
  tickAtMs?: number;
}

/** Bit flags summarising a unit's debuffs, synced to clients for tinting. */
export const STATUS = { stunned: 1, slowed: 2, poisoned: 4, armorBroken: 8 } as const;

/** Visual events for ability procs. */
export type EffectKind = 'crit' | 'heal' | 'nova' | 'stun' | 'splash';
export const EFFECT_KINDS: readonly EffectKind[] = ['crit', 'heal', 'nova', 'stun', 'splash'];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const AURA_LABEL: Record<AuraStat, string> = { damage: 'DMG', armor: 'ARMOR', attackSpeed: 'SPEED', regen: 'REGEN' };

/** Short HUD description (fits the 8 px info panel). */
export function describeAbility(a: AbilityDef): string {
  switch (a.kind) {
    case 'aura': {
      const sign = a.enemies ? '-' : '+';
      const value = a.stat === 'damage' || a.stat === 'attackSpeed' ? pct(a.amount) : String(a.amount);
      return `AURA ${sign}${value} ${AURA_LABEL[a.stat]}`;
    }
    case 'splash':
      return `SPLASH ${pct(a.ratio)}`;
    case 'multishot':
      return `MULTISHOT +${a.targets}`;
    case 'crit':
      return `CRIT ${pct(a.chance)} X${a.multiplier}`;
    case 'lifesteal':
      return `LIFESTEAL ${pct(a.ratio)}`;
    case 'thorns':
      return `THORNS ${pct(a.ratio)}`;
    case 'poison':
      return `POISON ${a.dps}/S`;
    case 'slow':
      return `SLOW ${pct(a.amount)}`;
    case 'stun':
      return `STUN ${pct(a.chance)}`;
    case 'armorBreak':
      return `ARMOR -${a.amount}`;
    case 'heal':
      return `HEAL ${a.amount}/${a.cooldownMs / 1000}S`;
    case 'nova':
      return `NOVA ${a.damage}`;
  }
}
