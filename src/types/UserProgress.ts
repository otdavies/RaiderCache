import { UserHideoutProgress } from './HideoutModule';

export interface UserProgress {
  hideoutLevels: UserHideoutProgress;
  completedQuests: string[];
  completedProjects: string[];
  lastUpdated: number; // timestamp
}

export const DEFAULT_USER_PROGRESS: UserProgress = {
  hideoutLevels: {
    scrappy: 1,
    gunsmith: 1,
    gear_bench: 1,
    medical_lab: 1,
    explosives_station: 1,
    utility_station: 1,
    refiner: 1,
    workbench: 1
  },
  completedQuests: [],
  completedProjects: [],
  lastUpdated: Date.now()
};

export interface FilterState {
  searchQuery: string;
  selectedDecisions: Set<string>;
  selectedRarities: Set<string>;
  selectedCategory: string;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  searchQuery: '',
  selectedDecisions: new Set(),
  selectedRarities: new Set(),
  selectedCategory: ''
};
