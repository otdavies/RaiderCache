export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemCategory =
  | 'material_basic'
  | 'material_refined'
  | 'material_topside'
  | 'material_advanced'
  | 'recyclable'
  | 'nature'
  | 'trinket'
  | 'weapon'
  | 'modification'
  | 'ammunition'
  | 'consumable'
  | 'blueprint'
  | 'quest_item'
  | 'misc';

export interface ItemEffect {
  label: string; // English only (previously multilingual)
  value: string | number;
}

export interface Item {
  id: string;
  name: string; // English only (previously multilingual)
  description?: string; // English only (previously multilingual)
  type: string;
  rarity?: Rarity;  // Optional - not all items have rarity in API data
  value: number; // Coin value
  weightKg: number;
  stackSize: number;
  recyclesInto?: Record<string, number>; // itemId -> quantity
  salvagesInto?: Record<string, number>; // itemId -> quantity
  crafting?: Record<string, number>; // itemId -> quantity (used by weapons/ammo for recycle materials)
  recipe?: Record<string, number>; // ingredientId -> quantity
  upgradeCost?: Record<string, number>; // itemId -> quantity (cost to upgrade to this tier)
  craftBench?: string;
  effects?: ItemEffect[];
  foundIn?: string[];
  imageFilename?: string;
  updatedAt?: string;
  tip?: string; // English only (previously multilingual)
  _note?: string;
}

export interface ItemWithDecision extends Item {
  decision: RecycleDecision;
  decisionReasons: string[];
}

export type RecycleDecision = 'keep' | 'sell_or_recycle' | 'situational';

export interface DecisionReason {
  decision: RecycleDecision;
  reasons: string[];
  dependencies?: string[]; // Quest/project/upgrade names
  recycleValueExceedsItem?: boolean; // True if recycling yields more value than item
}
