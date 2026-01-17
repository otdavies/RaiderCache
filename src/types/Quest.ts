export interface QuestRequirement {
  type?: string;
  item_id?: string;
  quantity?: number;
  value?: number | string;
}

export interface QuestReward {
  type?: string;
  item_id?: string;
  quantity?: number;
  value?: number;
}

export interface Quest {
  id: string;
  name: string;
  description?: string;
  objectives?: string[];
  requirements?: QuestRequirement[];
  rewards?: QuestReward[];
  rewardItemIds?: Array<{item_id: string; quantity: number}>;
  trader?: string;
  questGiver?: string; // deprecated, use trader
  unlocks?: string[];
  xp?: number;
  sortOrder?: number;
  updatedAt?: string;
  previousQuestIds?: string[];
  nextQuestIds?: string[];
}
