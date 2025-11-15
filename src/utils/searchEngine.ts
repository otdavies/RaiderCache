import Fuse from 'fuse.js';
import type { Item } from '../types/Item';
import type { DecisionReason } from '../types/Item';

export interface SearchableItem extends Item {
  decisionData: DecisionReason;
}

/**
 * Determines if an item is a cosmetic (outfit, emote, charm, color)
 */
export function isCosmetic(item: Item): boolean {
  const name = item.name?.toLowerCase() || '';
  return (
    name.includes('(outfit)') ||
    name.includes('(emote)') ||
    name.includes('(backpack charm)') ||
    name.includes('(color)') ||
    name.includes('(colour)')
  );
}

export class SearchEngine {
  private fuse: Fuse<SearchableItem>;

  constructor(items: SearchableItem[]) {
    this.fuse = new Fuse(items, {
      keys: [
        { name: 'name', weight: 2 }, // Now just 'name' (English only)
        { name: 'description', weight: 1 }, // Now just 'description' (English only)
        { name: 'type', weight: 1.5 },
        { name: 'id', weight: 0.5 }
      ],
      threshold: 0.3,
      includeScore: true,
      useExtendedSearch: true
    });
  }

  /**
   * Search items by query
   */
  search(query: string): SearchableItem[] {
    if (!query.trim()) {
      return [];
    }

    const results = this.fuse.search(query);
    return results.map(result => result.item);
  }

  /**
   * Update search index with new items
   */
  updateIndex(items: SearchableItem[]): void {
    this.fuse.setCollection(items);
  }
}
