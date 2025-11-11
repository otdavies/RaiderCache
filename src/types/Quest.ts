export interface QuestRequirement {
  type: string;
  itemId?: string;
  quantity?: number;
  value?: number | string;
}

export interface QuestReward {
  type: string;
  itemId?: string;
  quantity?: number;
  value?: number;
}

export interface Quest {
  id: string;
  name: string; // English only (previously multilingual)
  description?: string; // English only (previously multilingual)
  requirements?: QuestRequirement[];
  rewards?: QuestReward[];
  rewardItemIds?: Array<{itemId: string; quantity: number}>;
  questGiver?: string;
  unlocks?: string[];
  xp?: number;
  updatedAt?: string;
  previousQuestIds?: string[];
  nextQuestIds?: string[];
}
