import type { ArmorType, AttackType } from '@legion/shared';

/** One colour and icon per damage type, used everywhere types appear. */
export const ATTACK_INFO: Record<AttackType, { name: string; color: number; icon: string }> = {
  normal: { name: 'NORMAL', color: 0xe0e0e8, icon: 'type-normal' },
  pierce: { name: 'PIERCE', color: 0x78e878, icon: 'type-pierce' },
  siege: { name: 'SIEGE', color: 0xffa848, icon: 'type-siege' },
  magic: { name: 'MAGIC', color: 0x68c8ff, icon: 'type-magic' },
  chaos: { name: 'CHAOS', color: 0xd078ff, icon: 'type-chaos' },
};

export const ARMOR_INFO: Record<ArmorType, { name: string; color: number }> = {
  unarmored: { name: 'NONE', color: 0xe8e8e8 },
  light: { name: 'LIGHT', color: 0xfff070 },
  medium: { name: 'MEDIUM', color: 0xffa860 },
  heavy: { name: 'HEAVY', color: 0xff78c8 },
  fortified: { name: 'FORT', color: 0xa8b4d0 },
  hero: { name: 'HERO', color: 0xffd040 },
};

export const ATTACK_ORDER: AttackType[] = ['normal', 'pierce', 'siege', 'magic', 'chaos'];
export const ARMOR_ORDER: ArmorType[] = ['unarmored', 'light', 'medium', 'heavy', 'fortified', 'hero'];
export const ARMOR_ICON = 'type-armor';

/** Green for an advantage, red for a disadvantage, white when even. */
export function multiplierColor(m: number): number {
  return m > 1.001 ? 0x70ff70 : m < 0.999 ? 0xff7070 : 0xffffff;
}
