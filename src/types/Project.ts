export interface ProjectRequirement {
  item_id: string;
  quantity: number;
}

export interface ProjectPhase {
  phase: number;
  name?: string; // English only (previously multilingual)
  requirementItemIds?: ProjectRequirement[];
}

export interface Project {
  id: string;
  name: string; // English only (previously multilingual)
  description?: string; // English only (previously multilingual)
  requirements?: ProjectRequirement[];  // Legacy format
  phases?: ProjectPhase[];  // Actual format from data
  unlocks?: string[];
}
