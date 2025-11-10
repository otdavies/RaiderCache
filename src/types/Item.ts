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

export interface RecycleOutput {
  itemId: string;
  quantity: number;
}

export interface CraftRecipe {
  itemId: string;
  quantity: number;
}

export interface ItemEffect {
  label: Record<string, string>; // language code -> label
  value: string | number;
}

export interface Item {
  id: string;
  name: Record<string, string>; // language code -> name
  description?: Record<string, string>;
  type: string;
  rarity?: Rarity;  // Optional - not all items have rarity in API data
  value: number; // Coin value
  weightKg: number;
  stackSize: number;
  recyclesInto?: RecycleOutput[];
  salvagesInto?: RecycleOutput[];
  recipe?: CraftRecipe[];
  craftBench?: string;
  effects?: ItemEffect[];
  foundIn?: string[];
  imageFilename?: string;
  updatedAt?: string;
  tip?: Record<string, string>;
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
}
