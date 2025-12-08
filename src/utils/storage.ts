import type { UserProgress } from '../types/UserProgress';
import { DEFAULT_USER_PROGRESS } from '../types/UserProgress';

const STORAGE_KEYS = {
  USER_PROGRESS: 'arc_raiders_user_progress',
  FAVORITES: 'arc_raiders_favorites',
  CATEGORY_FILTERS: 'arc_raiders_category_filters',
  PVP_GATE: 'arc_raiders_pvp_gate'
} as const;

export type CategoryFilterState = Record<string, 'include' | 'exclude'>;

export class StorageManager {
  /**
   * Load user progress from localStorage
   */
  static loadUserProgress(): UserProgress {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.USER_PROGRESS);
      if (stored) {
        const progress = JSON.parse(stored) as UserProgress;
        // Ensure all hideout modules exist
        const mergedProgress = {
          ...DEFAULT_USER_PROGRESS,
          ...progress,
          hideoutLevels: {
            ...DEFAULT_USER_PROGRESS.hideoutLevels,
            ...progress.hideoutLevels
          }
        };
        return mergedProgress;
      }
    } catch (error) {
      console.error('Failed to load user progress:', error);
    }

    return { ...DEFAULT_USER_PROGRESS };
  }

  /**
   * Save user progress to localStorage
   */
  static saveUserProgress(progress: UserProgress): void {
    try {
      progress.lastUpdated = Date.now();
      localStorage.setItem(STORAGE_KEYS.USER_PROGRESS, JSON.stringify(progress));
    } catch (error) {
      console.error('Failed to save user progress:', error);
    }
  }

  /**
   * Update hideout level
   */
  static updateHideoutLevel(moduleId: string, level: number): void {
    const progress = this.loadUserProgress();
    progress.hideoutLevels[moduleId] = level;
    this.saveUserProgress(progress);
  }

  /**
   * Mark quest as completed
   */
  static completeQuest(questId: string): void {
    const progress = this.loadUserProgress();
    if (!progress.completedQuests.includes(questId)) {
      progress.completedQuests.push(questId);
      this.saveUserProgress(progress);
    }
  }

  /**
   * Mark project as completed
   */
  static completeProject(projectId: string): void {
    const progress = this.loadUserProgress();
    if (!progress.completedProjects.includes(projectId)) {
      progress.completedProjects.push(projectId);
      this.saveUserProgress(progress);
    }
  }

  /**
   * Reset all progress
   */
  static resetProgress(): void {
    localStorage.removeItem(STORAGE_KEYS.USER_PROGRESS);
  }

  /**
   * Load favorite items
   */
  static loadFavorites(): Set<string> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
    return new Set();
  }

  /**
   * Save favorite items
   */
  static saveFavorites(favorites: Set<string>): void {
    try {
      localStorage.setItem(
        STORAGE_KEYS.FAVORITES,
        JSON.stringify(Array.from(favorites))
      );
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  }

  /**
   * Toggle favorite
   */
  static toggleFavorite(itemId: string): boolean {
    const favorites = this.loadFavorites();
    if (favorites.has(itemId)) {
      favorites.delete(itemId);
    } else {
      favorites.add(itemId);
    }
    this.saveFavorites(favorites);
    return favorites.has(itemId);
  }

  /**
   * Load category filters from localStorage
   */
  static loadCategoryFilters(): Map<string, 'include' | 'exclude'> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CATEGORY_FILTERS);
      if (stored) {
        const parsed = JSON.parse(stored) as CategoryFilterState;
        return new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.error('Failed to load category filters:', error);
    }
    return new Map();
  }

  /**
   * Save category filters to localStorage
   */
  static saveCategoryFilters(filters: Map<string, 'include' | 'exclude'>): void {
    try {
      const obj: CategoryFilterState = Object.fromEntries(filters);
      localStorage.setItem(STORAGE_KEYS.CATEGORY_FILTERS, JSON.stringify(obj));
    } catch (error) {
      console.error('Failed to save category filters:', error);
    }
  }

  static getPvPGateAnswer(): number | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PVP_GATE);
      if (stored) {
        return JSON.parse(stored) as number;
      }
    } catch (error) {
      console.error('Failed to load PvP gate answer:', error);
    }
    return null;
  }

  static setPvPGateAnswer(answer: number): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PVP_GATE, JSON.stringify(answer));
    } catch (error) {
      console.error('Failed to save PvP gate answer:', error);
    }
  }
}
