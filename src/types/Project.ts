export interface ProjectRequirement {
  itemId: string;
  quantity: number;
}

export interface Project {
  id: string;
  name: Record<string, string>;
  description?: Record<string, string>;
  requirements: ProjectRequirement[];
  unlocks?: string[];
}
