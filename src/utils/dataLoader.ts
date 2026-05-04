import type { Item } from '../types/Item';
import type { HideoutModule } from '../types/HideoutModule';
import type { Quest } from '../types/Quest';
import type { Project } from '../types/Project';

export interface GameData {
  items: Item[];
  hideoutModules: HideoutModule[];
  quests: Quest[];
  projects: Project[];
  metadata: {
    lastUpdated: string;
    source: string;
    version: string;
  };
}

interface PriceOverride {
  value: number;
  source: string;
  confidence: string;
}

interface PriceOverrides {
  metadata: {
    version: string;
    lastUpdated: string;
    description: string;
  };
  overrides: Record<string, PriceOverride>;
}

export class DataLoader {
  private static instance: DataLoader;
  private dataCache: GameData | null = null;
  private readonly baseUrl: string;

  private constructor() {
    // Use Vite's BASE_URL to handle GitHub Pages subpath
    this.baseUrl = import.meta.env.BASE_URL || '/';
  }

  static getInstance(): DataLoader {
    if (!DataLoader.instance) {
      DataLoader.instance = new DataLoader();
    }
    return DataLoader.instance;
  }

  /**
   * Construct full path with base URL
   */
  private getPath(relativePath: string): string {
    // Remove leading slash if present to avoid double slashes
    const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return `${this.baseUrl}${path}`;
  }

  /**
   * Load all game data
   */
  async loadGameData(): Promise<GameData> {
    if (this.dataCache) {
      return this.dataCache;
    }

    try {
      const [items, hideoutModules, quests, projects, metadata, priceOverrides] = await Promise.all([
        this.fetchJSON<Item[]>(this.getPath('data/items.json')),
        this.fetchJSON<HideoutModule[]>(this.getPath('data/hideoutModules.json')),
        this.fetchJSON<Quest[]>(this.getPath('data/quests.json')),
        this.fetchJSON<Project[]>(this.getPath('data/projects.json')),
        this.fetchJSON<any>(this.getPath('data/metadata.json')),
        this.loadPriceOverrides()
      ]);

      // Apply price overrides to items
      const itemsWithOverrides = this.applyPriceOverrides(items, priceOverrides);

      // Normalize items data
      const normalizedItems = this.normalizeItems(itemsWithOverrides);

      this.dataCache = {
        items: normalizedItems,
        hideoutModules,
        quests,
        projects,
        metadata
      };

      return this.dataCache;
    } catch (error) {
      console.error('Failed to load game data:', error);
      throw new Error('Failed to load game data. Please refresh the page.');
    }
  }

  /**
   * Load price overrides from priceOverrides.json
   */
  private async loadPriceOverrides(): Promise<PriceOverrides | null> {
    try {
      return await this.fetchJSON<PriceOverrides>(this.getPath('data/priceOverrides.json'));
    } catch (error) {
      console.warn('Price overrides not found, using default values:', error);
      return null;
    }
  }

  /**
   * Apply price overrides to items
   */
  private applyPriceOverrides(items: Item[], priceOverrides: PriceOverrides | null): Item[] {
    if (!priceOverrides) {
      return items;
    }

    let appliedCount = 0;
    const updatedItems = items.map(item => {
      const override = priceOverrides.overrides[item.id];
      if (override) {
        appliedCount++;
        return {
          ...item,
          value: override.value,
          _note: `Price override: ${override.source} (confidence: ${override.confidence})`
        };
      }
      return item;
    });

    console.log(`Applied ${appliedCount} price overrides from ${priceOverrides.metadata.lastUpdated}`);
    return updatedItems;
  }

  /**
   * Normalize item data (e.g., parse foundIn strings into arrays)
   */
  private normalizeItems(items: Item[]): Item[] {
    return items.map(item => {
      // Parse foundIn from comma-separated string to array
      if (item.foundIn) {
        if (typeof item.foundIn === 'string') {
          const foundInStr = item.foundIn as unknown as string;
          return {
            ...item,
            foundIn: foundInStr
              .split(',')
              .map(loc => loc.trim())
              .filter(loc => loc.length > 0)
          };
        }
      }
      return item;
    });
  }

  /**
   * Fetch JSON with error handling
   */
  private async fetchJSON<T>(url: string): Promise<T> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    return response.json();
  }

  /**
   * Get icon URL for an item
   */
  getIconUrl(item: Item): string {
    if (!item.imageFilename) {
      // Return transparent 1x1 pixel to avoid 404 errors
      return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E';
    }

    // Handle both URL and relative path formats
    if (item.imageFilename.startsWith('http')) {
      // Extract filename from URL
      const url = new URL(item.imageFilename);
      const filename = url.pathname.split('/').pop();
      if (!filename) {
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E';
      }
      return this.getPath(`assets/icons/${filename}`);
    }

    return this.getPath(`assets/icons/${item.imageFilename}`);
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.dataCache = null;
  }
}

export const dataLoader = DataLoader.getInstance();
