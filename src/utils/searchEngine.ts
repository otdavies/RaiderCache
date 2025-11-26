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
  private items: SearchableItem[];
  private currentLanguage: string;

  constructor(items: SearchableItem[], language: string = 'en') {
    this.items = items;
    this.currentLanguage = language;
    this.fuse = this.createFuseInstance(items, language);
  }

  private createFuseInstance(items: SearchableItem[], language: string): Fuse<SearchableItem> {
    // Build searchable items with language-specific names
    const searchableItems = items.map(item => ({
      ...item,
      _searchName: this.getItemName(item, language),
      _searchDescription: this.getItemDescription(item, language)
    }));

    return new Fuse(searchableItems, {
      keys: [
        { name: '_searchName', weight: 2 },
        { name: 'name', weight: 1.5 }, // Fallback to original name
        { name: '_searchDescription', weight: 1 },
        { name: 'type', weight: 1.5 },
        { name: 'id', weight: 0.5 }
      ],
      threshold: 0.3,
      includeScore: true,
      useExtendedSearch: true
    });
  }

  private getItemName(item: Item, language: string): string {
    if (typeof item.name === 'object' && item.name !== null) {
      return (item.name as Record<string, string>)[language] || (item.name as Record<string, string>)['en'] || '';
    }
    return item.name || '';
  }

  private getItemDescription(item: Item, language: string): string {
    if (typeof item.description === 'object' && item.description !== null) {
      return (item.description as Record<string, string>)[language] || (item.description as Record<string, string>)['en'] || '';
    }
    return item.description || '';
  }

  /**
   * Set the current language and rebuild the index
   */
  setLanguage(language: string): void {
    if (language !== this.currentLanguage) {
      this.currentLanguage = language;
      this.fuse = this.createFuseInstance(this.items, language);
    }
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
    this.items = items;
    this.fuse = this.createFuseInstance(items, this.currentLanguage);
  }
}
