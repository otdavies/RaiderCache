import type { Item } from '../types/Item';
import type { SearchableItem } from './searchEngine';

/**
 * Utility for grouping weapon variants (I, II, III, IV, V tiers)
 */

interface WeaponGroup {
  baseName: string;
  baseId: string;
  variants: SearchableItem[];
  highestTier: SearchableItem;
  tierNumber: number;
}

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

  /**
   * Group weapon variants together
   */
  static groupWeapons(items: SearchableItem[]): Map<string, WeaponGroup> {
    const groups = new Map<string, WeaponGroup>();

    for (const item of items) {
      if (!this.isWeaponVariant(item)) continue;

      const baseId = this.getBaseId(item.id);
      const baseName = this.getBaseName(item.name);
      const tierNumber = this.getTierNumber(item.id);

      if (!groups.has(baseId)) {
        groups.set(baseId, {
          baseName,
          baseId,
          variants: [],
          highestTier: item,
          tierNumber
        });
      }

      const group = groups.get(baseId)!;
      group.variants.push(item);

      // Update highest tier if this one is higher
      if (tierNumber > group.tierNumber) {
        group.highestTier = item;
        group.tierNumber = tierNumber;
      }
    }

    return groups;
  }

  /**
   * Filter items to show only highest tier weapons
   */
  static filterToHighestTiers(items: SearchableItem[]): SearchableItem[] {
    const groups = this.groupWeapons(items);
    const highestTierIds = new Set(
      Array.from(groups.values()).map(g => g.highestTier.id)
    );

    return items.filter(item => {
      if (!this.isWeaponVariant(item)) return true; // Keep non-variants
      return highestTierIds.has(item.id); // Only keep highest tier of each weapon
    });
  }

  /**
   * Get all lower tier variants for a weapon
   */
  static getLowerTierVariants(item: SearchableItem, allItems: SearchableItem[]): SearchableItem[] {
    if (!this.isWeaponVariant(item)) return [];

    const baseId = this.getBaseId(item.id);
    const currentTier = this.getTierNumber(item.id);

    return allItems.filter(other => {
      if (other.id === item.id) return false;
      if (this.getBaseId(other.id) !== baseId) return false;
      return this.getTierNumber(other.id) < currentTier;
    });
  }
}
