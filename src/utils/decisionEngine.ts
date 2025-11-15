import type { Item, DecisionReason } from '../types/Item';
import type { UserProgress } from '../types/UserProgress';
import type { HideoutModule } from '../types/HideoutModule';
import type { Quest } from '../types/Quest';
import type { Project } from '../types/Project';
import { WeaponGrouper } from './weaponGrouping';
import { buildReverseRecipeIndex } from './recipeUtils';

export class DecisionEngine {
  private items: Map<string, Item>;
  private hideoutModules: HideoutModule[];
  private quests: Quest[];
  private projects: Project[];
  private reverseRecipeIndex: Map<string, string[]>;

  constructor(
    items: Item[],
    hideoutModules: HideoutModule[],
    quests: Quest[],
    projects: Project[]
  ) {
    this.items = new Map(items.map(item => [item.id, item]));
    this.hideoutModules = hideoutModules;
    this.quests = quests;
    this.projects = projects;
    this.reverseRecipeIndex = buildReverseRecipeIndex(items);
  }

  /**
   * Finalize decision by checking if recycle value exceeds item value
   */
  private finalizeDecision(item: Item, decision: DecisionReason): DecisionReason {
    // Check if recycle value exceeds item value
    const recycleData = item.recyclesInto || item.salvagesInto || item.crafting;
    if (recycleData && Object.keys(recycleData).length > 0) {
      const recycleValue = this.evaluateRecycleValue(item);
      if (recycleValue.estimatedValue > item.value) {
        return { ...decision, recycleValueExceedsItem: true };
      }
    }
    return decision;
  }

  /**
   * Main decision logic - determines if player should keep, recycle, or sell an item
   */
  getDecision(item: Item, userProgress: UserProgress): DecisionReason {
    // Priority 0: Seeds - ALWAYS KEEP (valuable currency)
    if (item.id === 'assorted_seeds') {
      return this.finalizeDecision(item, {
        decision: 'keep',
        reasons: [
          'Valuable currency item',
          'Used for trading with Celeste'
        ]
      });
    }

    // Priority 1: Legendaries - ALWAYS KEEP
    if (item.rarity?.toLowerCase() === 'legendary') {
      return this.finalizeDecision(item, {
        decision: 'keep',
        reasons: [
          'Legendary rarity - extremely valuable',
          'Keep all legendaries'
        ]
      });
    }

    // Priority 2: Blueprints - ALWAYS REVIEW
    if (item.type === 'Blueprint') {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          'Blueprint - valuable for unlocking crafting recipes',
          'Review carefully before selling or recycling'
        ]
      });
    }

    // Priority 3: All weapons - ALWAYS REVIEW
    if (item.type === 'Weapon' || WeaponGrouper.isWeaponVariant(item)) {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          'Weapon - review based on your current loadout',
          'Consider tier and your play style'
        ]
      });
    }

    // Priority 4: Ammunition - ALWAYS REVIEW
    if (item.type === 'Ammunition') {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          'Ammunition - essential for weapons',
          'Review based on your weapon loadout'
        ]
      });
    }

    // Priority 5: Quick Use items (grenades, healing items, etc.) - ALWAYS REVIEW
    if (item.type === 'Quick Use') {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          'Consumable item - grenades, healing items, etc.',
          'Review based on your current inventory needs'
        ]
      });
    }

    // Priority 6: Keys - ALWAYS REVIEW
    if (item.type === 'Key') {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          'Key - opens locked areas and containers',
          'Review based on areas you want to access'
        ]
      });
    }

    // Priority 7: Quest items (ALWAYS KEEP)
    const questUse = this.isUsedInActiveQuests(item, userProgress);
    if (questUse.isUsed) {
      return this.finalizeDecision(item, {
        decision: 'keep',
        reasons: [`Required for quest: ${questUse.questNames.join(', ')}`],
        dependencies: questUse.questNames
      });
    }

    // Priority 8: Project items (KEEP if projects not completed)
    const projectUse = this.isUsedInActiveProjects(item, userProgress);
    if (projectUse.isUsed) {
      return this.finalizeDecision(item, {
        decision: 'keep',
        reasons: [`Needed for project: ${projectUse.projectNames.join(', ')}`],
        dependencies: projectUse.projectNames
      });
    }

    // Priority 9: Hideout upgrade materials (KEEP if needed)
    const upgradeUse = this.isNeededForUpgrades(item, userProgress);
    if (upgradeUse.isNeeded) {
      return this.finalizeDecision(item, {
        decision: 'keep',
        reasons: [
          `Required for hideout upgrade: ${upgradeUse.moduleNames.join(', ')}`
        ],
        dependencies: upgradeUse.moduleNames
      });
    }

    // Priority 10: Crafting materials (SITUATIONAL based on rarity and use)
    const craftingValue = this.evaluateCraftingValue(item);
    if (craftingValue.isValuable) {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          `Used in ${craftingValue.recipeCount} crafting recipes`,
          craftingValue.details
        ]
      });
    }

    // Priority 11: High value trinkets/items (SELL OR RECYCLE)
    if (this.isHighValueTrinket(item)) {
      return this.finalizeDecision(item, {
        decision: 'sell_or_recycle',
        reasons: [
          `High value (${item.value} coins)`,
          'No crafting or upgrade use'
        ]
      });
    }

    // Priority 12: Items that recycle into valuable materials (SELL OR RECYCLE)
    const recycleData = item.recyclesInto || item.salvagesInto || item.crafting;
    if (recycleData && Object.keys(recycleData).length > 0) {
      const recycleValue = this.evaluateRecycleValue(item);
      if (recycleValue.isValuable) {
        return this.finalizeDecision(item, {
          decision: 'sell_or_recycle',
          reasons: [
            `Recycles into: ${recycleValue.description}`,
            `Recycle value: Components (${recycleValue.estimatedValue} coins) worth less than Item (${item.value} coins)`
          ]
        });
      }
    }

    // Priority 13: Rare/Epic items (SITUATIONAL - player decision)
    if (item.rarity && ['rare', 'epic'].includes(item.rarity.toLowerCase())) {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          `${item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)} rarity`,
          'May have future use - review carefully'
        ]
      });
    }

    // Default: Safe to sell or recycle
    return this.finalizeDecision(item, {
      decision: 'sell_or_recycle',
      reasons: ['No immediate use found', 'Safe to sell or recycle']
    });
  }

  /**
   * Check if item is used in any active (incomplete) quests
   */
  private isUsedInActiveQuests(
    item: Item,
    userProgress: UserProgress
  ): { isUsed: boolean; questNames: string[] } {
    const questNames: string[] = [];

    for (const quest of this.quests) {
      // Skip completed quests
      if (userProgress.completedQuests.includes(quest.id)) {
        continue;
      }

      // Check if item is in quest requirements
      let isRequired = false;

      if (quest.requirements && quest.requirements.length > 0) {
        isRequired = quest.requirements.some(
          req => req.item_id === item.id
        );
      }

      // Also check rewardItemIds (the actual data structure uses this)
      if (!isRequired && quest.rewardItemIds && quest.rewardItemIds.length > 0) {
        isRequired = quest.rewardItemIds.some(
          reward => reward.item_id === item.id
        );
      }

      if (isRequired) {
        questNames.push(quest.name);
      }
    }

    return {
      isUsed: questNames.length > 0,
      questNames
    };
  }

  /**
   * Check if item is used in any active (incomplete) projects
   */
  private isUsedInActiveProjects(
    item: Item,
    userProgress: UserProgress
  ): { isUsed: boolean; projectNames: string[] } {
    const projectNames: string[] = [];

    for (const project of this.projects) {
      // Skip completed projects
      if (userProgress.completedProjects.includes(project.id)) {
        continue;
      }

      let isRequired = false;

      // Check legacy requirements format
      if (project.requirements && project.requirements.length > 0) {
        isRequired = project.requirements.some(
          req => req.item_id === item.id
        );
      }

      // Check phases format (actual data structure)
      if (!isRequired && project.phases && project.phases.length > 0) {
        for (const phase of project.phases) {
          if (phase.requirementItemIds && phase.requirementItemIds.length > 0) {
            if (phase.requirementItemIds.some(req => req.item_id === item.id)) {
              isRequired = true;
              break;
            }
          }
        }
      }

      if (isRequired) {
        projectNames.push(project.name);
      }
    }

    return {
      isUsed: projectNames.length > 0,
      projectNames
    };
  }

  /**
   * Check if item is needed for hideout upgrades
   */
  private isNeededForUpgrades(
    item: Item,
    userProgress: UserProgress
  ): { isNeeded: boolean; moduleNames: string[] } {
    const moduleNames: string[] = [];

    for (const module of this.hideoutModules) {
      const currentLevel = userProgress.hideoutLevels[module.id] || 1;

      // Check if player has maxed this module
      if (currentLevel >= module.maxLevel) {
        continue;
      }

      // Check if module has levels
      if (!module.levels || module.levels.length === 0) {
        continue;
      }

      // Check upcoming levels for this item
      for (const levelData of module.levels) {
        if (levelData.level <= currentLevel) {
          continue; // Already completed this level
        }

        // Check if this level has requirements
        if (!levelData.requirementItemIds || levelData.requirementItemIds.length === 0) {
          continue;
        }

        const isRequired = levelData.requirementItemIds.some(
          req => req.item_id === item.id
        );

        if (isRequired) {
          moduleNames.push(`${module.name} (Level ${levelData.level})`);
        }
      }
    }

    return {
      isNeeded: moduleNames.length > 0,
      moduleNames
    };
  }

  /**
   * Evaluate if item has high crafting value (used as ingredient in other recipes)
   */
  private evaluateCraftingValue(item: Item): {
    isValuable: boolean;
    recipeCount: number;
    details: string;
  } {
    // Check how many items use THIS item as an ingredient
    const recipeCount = this.reverseRecipeIndex.get(item.id)?.length || 0;
    const isRare = item.rarity ? ['rare', 'epic', 'legendary'].includes(item.rarity) : false;

    return {
      isValuable: recipeCount > 2 || (recipeCount > 0 && isRare),
      recipeCount,
      details: isRare
        ? 'Rare crafting material'
        : 'Common crafting ingredient'
    };
  }

  /**
   * Check if item is a high-value trinket
   */
  private isHighValueTrinket(item: Item): boolean {
    const highValueThreshold = 1000;
    const trinketKeywords = ['trinket', 'misc', 'collectible'];

    const hasNoRecipe = !item.recipe || Object.keys(item.recipe).length === 0;
    const recycleData = item.recyclesInto || item.salvagesInto || item.crafting;
    const hasNoRecycle = !recycleData || Object.keys(recycleData).length === 0;
    const isTrinket = trinketKeywords.some(keyword =>
      item.type.toLowerCase().includes(keyword)
    );

    return item.value >= highValueThreshold && hasNoRecipe && hasNoRecycle && isTrinket;
  }

  /**
   * Evaluate recycle value
   */
  private evaluateRecycleValue(item: Item): {
    isValuable: boolean;
    description: string;
    estimatedValue: number;
  } {
    // Check all possible recycle data sources
    const recycleData = item.recyclesInto || item.salvagesInto || item.crafting;
    if (!recycleData || Object.keys(recycleData).length === 0) {
      return {
        isValuable: false,
        description: 'Nothing',
        estimatedValue: 0
      };
    }

    const materials: string[] = [];
    let totalValue = 0;

    for (const [itemId, quantity] of Object.entries(recycleData)) {
      const outputItem = this.items.get(itemId);
      if (outputItem) {
        materials.push(`${quantity}x ${this.getItemName(outputItem)}`);
        totalValue += outputItem.value * quantity;
      }
    }

    return {
      isValuable: totalValue > item.value * 0.5, // At least 50% value retained
      description: materials.join(', '),
      estimatedValue: totalValue
    };
  }

  /**
   * Get item name
   */
  private getItemName(item: Item): string {
    return item.name;
  }

  /**
   * Get all items with their decisions
   */
  getItemsWithDecisions(userProgress: UserProgress): Array<Item & { decisionData: DecisionReason }> {
    const itemsWithDecisions: Array<Item & { decisionData: DecisionReason }> = [];

    for (const item of this.items.values()) {
      const decisionData = this.getDecision(item, userProgress);
      itemsWithDecisions.push({
        ...item,
        decisionData
      });
    }

    return itemsWithDecisions;
  }

  /**
   * Get decision statistics
   */
  getDecisionStats(userProgress: UserProgress): {
    keep: number;
    sell_or_recycle: number;
    situational: number;
  } {
    const stats = {
      keep: 0,
      sell_or_recycle: 0,
      situational: 0
    };

    for (const item of this.items.values()) {
      const decision = this.getDecision(item, userProgress);
      stats[decision.decision]++;
    }

    return stats;
  }

  /**
   * Get items that use this item as an ingredient in their recipes
   */
  getItemsUsingIngredient(itemId: string): Item[] {
    const itemIds = this.reverseRecipeIndex.get(itemId) || [];
    return itemIds
      .map(id => this.items.get(id))
      .filter((item): item is Item => item !== undefined);
  }
}
