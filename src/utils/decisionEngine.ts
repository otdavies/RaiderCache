import type { Item, DecisionReason } from '../types/Item';
import type { UserProgress } from '../types/UserProgress';
import type { HideoutModule } from '../types/HideoutModule';
import type { Quest } from '../types/Quest';
import type { Project } from '../types/Project';
import { WeaponGrouper } from './weaponGrouping';

export class DecisionEngine {
  private items: Map<string, Item>;
  private hideoutModules: HideoutModule[];
  private quests: Quest[];
  private projects: Project[];

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
  }

  /**
   * Main decision logic - determines if player should keep, recycle, or sell an item
   */
  getDecision(item: Item, userProgress: UserProgress): DecisionReason {
    // Priority 0: Lower tier weapons - ALWAYS RECYCLE
    if (WeaponGrouper.isWeaponVariant(item)) {
      const tierNumber = WeaponGrouper.getTierNumber(item.id);

      // Recycle tier I and II weapons
      if (tierNumber <= 2) {
        return {
          decision: 'sell_or_recycle',
          confidence: 95,
          reasons: [
            `Tier ${tierNumber} weapon - upgrade to higher tiers`,
            'Lower tier weapons become obsolete'
          ]
        };
      }

      // Tier III is situational
      if (tierNumber === 3) {
        return {
          decision: 'situational',
          confidence: 70,
          reasons: [
            'Mid-tier weapon',
            'Keep if you lack better weapons, otherwise recycle'
          ]
        };
      }

      // Tier IV+ are worth keeping until you get better
      if (tierNumber >= 4) {
        return {
          decision: 'keep',
          confidence: 85,
          reasons: [
            `High-tier weapon (Tier ${tierNumber})`,
            'Solid endgame weapon'
          ]
        };
      }
    }

    // Priority 1: Quest items (ALWAYS KEEP)
    const questUse = this.isUsedInActiveQuests(item, userProgress);
    if (questUse.isUsed) {
      return {
        decision: 'keep',
        confidence: 100,
        reasons: [`Required for quest: ${questUse.questNames.join(', ')}`],
        dependencies: questUse.questNames
      };
    }

    // Priority 2: Project items (KEEP if projects not completed)
    const projectUse = this.isUsedInActiveProjects(item, userProgress);
    if (projectUse.isUsed) {
      return {
        decision: 'keep',
        confidence: 95,
        reasons: [`Needed for project: ${projectUse.projectNames.join(', ')}`],
        dependencies: projectUse.projectNames
      };
    }

    // Priority 3: Hideout upgrade materials (KEEP if needed)
    const upgradeUse = this.isNeededForUpgrades(item, userProgress);
    if (upgradeUse.isNeeded) {
      return {
        decision: 'keep',
        confidence: 90,
        reasons: [
          `Required for hideout upgrade: ${upgradeUse.moduleNames.join(', ')}`
        ],
        dependencies: upgradeUse.moduleNames
      };
    }

    // Priority 4: Crafting materials (SITUATIONAL based on rarity and use)
    if (item.recipe && item.recipe.length > 0) {
      const craftingValue = this.evaluateCraftingValue(item);
      if (craftingValue.isValuable) {
        return {
          decision: 'situational',
          confidence: 70,
          reasons: [
            `Used in ${craftingValue.recipeCount} crafting recipes`,
            craftingValue.details
          ]
        };
      }
    }

    // Priority 5: High value trinkets/items (SELL OR RECYCLE)
    if (this.isHighValueTrinket(item)) {
      return {
        decision: 'sell_or_recycle',
        confidence: 95,
        reasons: [
          `High value (${item.value} coins)`,
          'No crafting or upgrade use'
        ]
      };
    }

    // Priority 6: Items that recycle into valuable materials (SELL OR RECYCLE)
    if (item.recyclesInto && item.recyclesInto.length > 0) {
      const recycleValue = this.evaluateRecycleValue(item);
      if (recycleValue.isValuable) {
        return {
          decision: 'sell_or_recycle',
          confidence: 85,
          reasons: [
            `Recycles into: ${recycleValue.description}`,
            `Total value: ${recycleValue.estimatedValue} coins`
          ]
        };
      }
    }

    // Priority 7: Rare/Epic/Legendary items (SITUATIONAL - player decision)
    if (item.rarity && ['rare', 'epic', 'legendary'].includes(item.rarity)) {
      return {
        decision: 'situational',
        confidence: 60,
        reasons: [
          `${item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)} rarity`,
          'May have future use - review carefully'
        ]
      };
    }

    // Default: Safe to sell or recycle
    return {
      decision: 'sell_or_recycle',
      confidence: 80,
      reasons: ['No immediate use found', 'Safe to sell or recycle']
    };
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
          req => req.itemId === item.id
        );
      }

      // Also check rewardItemIds (the actual data structure uses this)
      if (!isRequired && quest.rewardItemIds && quest.rewardItemIds.length > 0) {
        isRequired = quest.rewardItemIds.some(
          reward => reward.itemId === item.id
        );
      }

      if (isRequired) {
        questNames.push(quest.name['en'] || quest.name[Object.keys(quest.name)[0]]);
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
          req => req.itemId === item.id
        );
      }

      // Check phases format (actual data structure)
      if (!isRequired && project.phases && project.phases.length > 0) {
        for (const phase of project.phases) {
          if (phase.requirementItemIds && phase.requirementItemIds.length > 0) {
            if (phase.requirementItemIds.some(req => req.itemId === item.id)) {
              isRequired = true;
              break;
            }
          }
        }
      }

      if (isRequired) {
        projectNames.push(project.name['en'] || project.name[Object.keys(project.name)[0]]);
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
          req => req.itemId === item.id
        );

        if (isRequired) {
          const moduleName = module.name['en'] || module.name[Object.keys(module.name)[0]];
          moduleNames.push(`${moduleName} (Level ${levelData.level})`);
        }
      }
    }

    return {
      isNeeded: moduleNames.length > 0,
      moduleNames
    };
  }

  /**
   * Evaluate if item has high crafting value
   */
  private evaluateCraftingValue(item: Item): {
    isValuable: boolean;
    recipeCount: number;
    details: string;
  } {
    const recipeCount = item.recipe?.length || 0;
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

    const hasNoRecipe = !item.recipe || item.recipe.length === 0;
    const hasNoRecycle = !item.recyclesInto || item.recyclesInto.length === 0;
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
    if (!item.recyclesInto || item.recyclesInto.length === 0) {
      return {
        isValuable: false,
        description: 'Nothing',
        estimatedValue: 0
      };
    }

    const materials: string[] = [];
    let totalValue = 0;

    for (const output of item.recyclesInto) {
      const outputItem = this.items.get(output.itemId);
      if (outputItem) {
        materials.push(`${output.quantity}x ${this.getItemName(outputItem)}`);
        totalValue += outputItem.value * output.quantity;
      }
    }

    return {
      isValuable: totalValue > item.value * 0.5, // At least 50% value retained
      description: materials.join(', '),
      estimatedValue: totalValue
    };
  }

  /**
   * Get item name in English (or first available language)
   */
  private getItemName(item: Item): string {
    return item.name['en'] || item.name[Object.keys(item.name)[0]];
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
}
