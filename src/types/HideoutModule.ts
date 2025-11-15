export interface WorkshopRequirement {
  item_id: string;
  quantity: number;
}

export interface OtherRequirement {
  type: string;
  value: number;
}

export interface WorkshopLevel {
  level: number;
  requirementItemIds: WorkshopRequirement[];
  otherRequirements?: OtherRequirement[];
  description?: string; // English only (previously multilingual)
}

export interface HideoutModule {
  id: string;
  name: string; // English only (previously multilingual)
  maxLevel: number;
  levels: WorkshopLevel[];
}

export interface UserHideoutProgress {
  [moduleId: string]: number; // Current level for each module
}

export const WORKSHOP_IDS = {
  SCRAPPY: 'scrappy',
  GUNSMITH: 'gunsmith',
  GEAR_BENCH: 'gear_bench',
  MEDICAL_LAB: 'medical_lab',
  EXPLOSIVES_STATION: 'explosives_station',
  UTILITY_STATION: 'utility_station',
  REFINER: 'refiner',
  WORKBENCH: 'workbench'
} as const;

export type WorkshopId = typeof WORKSHOP_IDS[keyof typeof WORKSHOP_IDS];
