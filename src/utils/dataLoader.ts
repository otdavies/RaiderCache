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
      const [items, hideoutModules, quests, projects, metadata] = await Promise.all([
        this.fetchJSON<Item[]>(this.getPath('data/items.json')),
        this.fetchJSON<HideoutModule[]>(this.getPath('data/hideoutModules.json')),
        this.fetchJSON<Quest[]>(this.getPath('data/quests.json')),
        this.fetchJSON<Project[]>(this.getPath('data/projects.json')),
        this.fetchJSON<any>(this.getPath('data/metadata.json'))
      ]);

      this.dataCache = {
        items,
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
      return this.getPath('assets/icons/placeholder.png'); // Fallback
    }

    // Handle both URL and relative path formats
    if (item.imageFilename.startsWith('http')) {
      // Extract filename from URL
      const url = new URL(item.imageFilename);
      const filename = url.pathname.split('/').pop() || 'placeholder.png';
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
