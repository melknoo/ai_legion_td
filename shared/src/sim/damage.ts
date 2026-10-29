import type { ArmorType, AttackType, DamageTable } from './types.ts';

/** WC3 armor formula: positive armor reduces, negative armor amplifies damage. */
export function armorMultiplier(armor: number, factor: number): number {
  if (armor >= 0) return 1 - (factor * armor) / (1 + factor * armor);
  return 2 - Math.pow(1 - factor, -armor);
}

export function computeDamage(
  raw: number,
  attackType: AttackType,
  armorType: ArmorType,
  armor: number,
  table: DamageTable,
  armorFactor: number,
): number {
  return raw * table[attackType][armorType] * armorMultiplier(armor, armorFactor);
}
