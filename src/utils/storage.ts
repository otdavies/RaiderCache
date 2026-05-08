import type { UserProgress } from '../types/UserProgress';
import { DEFAULT_USER_PROGRESS } from '../types/UserProgress';

const LEGACY_COMPLETED_PHASE_VALUE = Number.MAX_SAFE_INTEGER;

const STORAGE_KEYS = {
  USER_PROGRESS: 'arc_raiders_user_progress',
  FAVORITES: 'arc_raiders_favorites',
  DECISION_FILTERS: 'arc_raiders_decision_filters',
  CATEGORY_FILTERS: 'arc_raiders_category_filters',
  PVP_GATE: 'arc_raiders_pvp_gate',
  VIEW_MODE: 'arc_raiders_view_mode',
  SIDEBAR_HIDDEN: 'arc_raiders_sidebar_hidden',
  QUEST_SHOW_NON_ITEM: 'arc_raiders_quest_show_non_item'
} as const;

export type CategoryFilterState = Record<string, 'include' | 'exclude'>;
export type ViewMode = 'grid' | 'list' | 'compact';
type DecisionFilter = 'keep' | 'sell_or_recycle' | 'situational';

export class StorageManager {
  /**
   * Load user progress from localStorage
   */
  static loadUserProgress(): UserProgress {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.USER_PROGRESS);
      if (stored) {
        const progress = JSON.parse(stored) as Partial<UserProgress>;

        const mergedProgress: UserProgress = {
          ...DEFAULT_USER_PROGRESS,
          ...progress,
          hideoutLevels: {
            ...DEFAULT_USER_PROGRESS.hideoutLevels,
            ...(progress.hideoutLevels || {})
          },
          projectPhaseProgress: {
            ...DEFAULT_USER_PROGRESS.projectPhaseProgress,
            ...(progress.projectPhaseProgress || {})
          }
        };

        // Migration: legacy completedProjects implies all phases complete.
        for (const projectId of mergedProgress.completedProjects) {
          const existing = mergedProgress.projectPhaseProgress[projectId] || 0;
          if (existing <= 0) {
            mergedProgress.projectPhaseProgress[projectId] = LEGACY_COMPLETED_PHASE_VALUE;
          }
        }

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
    }
    progress.projectPhaseProgress[projectId] = LEGACY_COMPLETED_PHASE_VALUE;
    this.saveUserProgress(progress);
  }

  /**
   * Set completed phase for a project
   */
  static updateProjectPhaseProgress(projectId: string, phase: number, maxPhase?: number): void {
    const progress = this.loadUserProgress();
    const normalizedPhase = Math.max(0, Math.floor(phase));
    progress.projectPhaseProgress[projectId] = normalizedPhase;

    // Keep legacy completedProjects aligned for backwards compatibility.
    if (typeof maxPhase === 'number' && maxPhase > 0) {
      const isFullyComplete = normalizedPhase >= maxPhase;
      if (isFullyComplete) {
        if (!progress.completedProjects.includes(projectId)) {
          progress.completedProjects.push(projectId);
        }
      } else {
        progress.completedProjects = progress.completedProjects.filter(id => id !== projectId);
      }
    }

    this.saveUserProgress(progress);
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
   * Load decision filters from localStorage
   */
  static loadDecisionFilters(): Set<DecisionFilter> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DECISION_FILTERS);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          return new Set(
            parsed.filter(
              (entry): entry is DecisionFilter =>
                entry === 'keep' || entry === 'sell_or_recycle' || entry === 'situational'
            )
          );
        }
      }
    } catch (error) {
      console.error('Failed to load decision filters:', error);
    }
    return new Set();
  }

  /**
   * Save decision filters to localStorage
   */
  static saveDecisionFilters(filters: Set<DecisionFilter>): void {
    try {
      localStorage.setItem(
        STORAGE_KEYS.DECISION_FILTERS,
        JSON.stringify(Array.from(filters))
      );
    } catch (error) {
      console.error('Failed to save decision filters:', error);
    }
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

  static loadViewMode(): ViewMode | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (parsed === 'grid' || parsed === 'list' || parsed === 'compact') {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load view mode:', error);
    }
    return null;
  }

  static saveViewMode(mode: ViewMode): void {
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, JSON.stringify(mode));
    } catch (error) {
      console.error('Failed to save view mode:', error);
    }
  }

  static loadSidebarHidden(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.SIDEBAR_HIDDEN) === 'true';
    } catch {
      return false;
    }
  }

  static saveSidebarHidden(hidden: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_HIDDEN, String(hidden));
    } catch (error) {
      console.error('Failed to save sidebar state:', error);
    }
  }

  static loadQuestShowNonItem(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.QUEST_SHOW_NON_ITEM) === 'true';
    } catch {
      return false;
    }
  }

  static saveQuestShowNonItem(show: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEYS.QUEST_SHOW_NON_ITEM, String(show));
    } catch (error) {
      console.error('Failed to save quest toggle state:', error);
    }
  }
}
