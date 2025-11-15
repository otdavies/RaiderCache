import type { Item } from '../types/Item';

/**
 * Utility for working with weapon variants (I, II, III, IV, V tiers)
 */

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const ROMAN_REGEX = /^(.+?)_([ivx]+)$/i;

export class WeaponGrouper {
  /**
   * Extract tier number from Roman numeral suffix
   */
  static getTierNumber(id: string): number {
    const match = id.match(ROMAN_REGEX);
    if (!match) return 0;

    const romanNumeral = match[2].toUpperCase();
    const index = ROMAN_NUMERALS.indexOf(romanNumeral);
    return index >= 0 ? index + 1 : 0;
  }

  /**
   * Check if item is a weapon variant
   */
  static isWeaponVariant(item: Item): boolean {
    return ROMAN_REGEX.test(item.id);
  }

  /**
   * Get base weapon ID (without tier suffix)
   */
  static getBaseId(id: string): string {
    const match = id.match(ROMAN_REGEX);
    return match ? match[1] : id;
  }

  /**
   * Get base weapon name (without tier suffix)
   */
  static getBaseName(name: string): string {
    // Remove " I", " II", " III", etc. from end of name
    return name.replace(/\s+[IVX]+$/i, '').trim();
  }
}
