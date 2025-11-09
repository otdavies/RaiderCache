import Fuse from 'fuse.js';
import type { Item } from '../types/Item';
import type { DecisionReason } from '../types/Item';

export interface SearchableItem extends Item {
  decisionData: DecisionReason;
}

export class SearchEngine {
  private fuse: Fuse<SearchableItem>;

  constructor(items: SearchableItem[]) {
    this.fuse = new Fuse(items, {
      keys: [
        { name: 'name.en', weight: 2 },
        { name: 'description.en', weight: 1 },
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
