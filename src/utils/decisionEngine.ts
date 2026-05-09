import type { Item, DecisionReason, DecisionDependencyDetail } from '../types/Item';
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
        reasons: [
          `Required for quest: ${questUse.questNames.join(', ')}`,
          `Total required for active quests: ${questUse.totalRequired}`
        ],
        dependencies: questUse.questNames,
        dependencyDetails: questUse.details
      });
    }

    // Priority 8: Project items (KEEP if projects not completed)
    const projectUse = this.isUsedInActiveProjects(item, userProgress);
    if (projectUse.isUsed) {
      return this.finalizeDecision(item, {
        decision: 'keep',
        reasons: [
          `Needed for project: ${projectUse.projectNames.join(', ')}`,
          `Total required for active projects: ${projectUse.totalRequired}`,
          ...projectUse.phaseRequirements.map(req => `Phase requirement: ${req}`)
        ],
        dependencies: projectUse.projectNames,
        dependencyDetails: projectUse.details
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

    // Priority 12: Snitch Scanner - SITUATIONAL (Call Arc can quickly farm quest points)
    if (item.id === 'snitch-scanner') {
      return this.finalizeDecision(item, {
        decision: 'situational',
        reasons: [
          'Call Arc can be used to quickly farm quest points',
          'Keep if you are actively progressing point-based quests'
        ]
      });
    }

    // Priority 13: Items that recycle into valuable materials (SELL OR RECYCLE)
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

    // Priority 14: Rare/Epic items (SITUATIONAL - player decision)
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
  ): { isUsed: boolean; questNames: string[]; totalRequired: number; details: DecisionDependencyDetail[] } {
    const questNames: string[] = [];
    let totalRequired = 0;
    const details: DecisionDependencyDetail[] = [];

    for (const quest of this.quests) {
      // Skip completed quests
      if (userProgress.completedQuests.includes(quest.id)) {
        continue;
      }

      let requiredQuantity = 0;

      if (quest.requirements && quest.requirements.length > 0) {
        for (const req of quest.requirements) {
          if (req.item_id === item.id) {
            requiredQuantity += Number(req.quantity) || 1;
          }
        }
      }

      // Also check rewardItemIds (the actual data structure uses this)
      if (quest.rewardItemIds && quest.rewardItemIds.length > 0) {
        for (const reward of quest.rewardItemIds) {
          if (reward.item_id === item.id) {
            requiredQuantity += Number(reward.quantity) || 1;
          }
        }
      }

      if (requiredQuantity > 0) {
        questNames.push(quest.name);
        totalRequired += requiredQuantity;
        details.push({
          kind: 'quest',
          id: quest.id,
          name: quest.name,
          totalRequired: requiredQuantity,
          trader: quest.trader,
          description: quest.description,
          objectives: Array.isArray(quest.objectives) ? quest.objectives : []
        });
      }
    }

    return {
      isUsed: questNames.length > 0,
      questNames,
      totalRequired,
      details
    };
  }

  /**
   * Check if item is used in any active (incomplete) projects
   */
  private isUsedInActiveProjects(
    item: Item,
    userProgress: UserProgress
  ): { isUsed: boolean; projectNames: string[]; phaseRequirements: string[]; totalRequired: number; details: DecisionDependencyDetail[] } {
    const projectNames: string[] = [];
    const phaseRequirements: string[] = [];
    let totalRequired = 0;
    const details: DecisionDependencyDetail[] = [];

    for (const project of this.projects) {
      const completedPhase = userProgress.projectPhaseProgress?.[project.id]
        ?? (userProgress.completedProjects.includes(project.id) ? Number.MAX_SAFE_INTEGER : 0);

      let requiredInProject = false;
      let requiredQuantityInProject = 0;
      const phaseDetails: Array<{
        phase: number;
        name?: string;
        requiredQuantity: number;
        status: 'completed' | 'requires_item' | 'open';
      }> = [];

      // Legacy requirements are treated as phase 1.
      if (project.requirements && project.requirements.length > 0) {
        const requiredInLegacy = project.requirements
          .filter(req => req.item_id === item.id)
          .reduce((sum, req) => sum + (Number(req.quantity) || 1), 0);

        const legacyStatus: 'completed' | 'requires_item' | 'open' = completedPhase >= 1
          ? 'completed'
          : requiredInLegacy > 0
            ? 'requires_item'
            : 'open';

        phaseDetails.push({
          phase: 1,
          requiredQuantity: requiredInLegacy,
          status: legacyStatus
        });

        if (completedPhase < 1 && requiredInLegacy > 0) {
          requiredInProject = true;
          requiredQuantityInProject += requiredInLegacy;
          phaseRequirements.push(`${project.name} (Phase 1) x${requiredInLegacy}`);
        }
      }

      if (project.phases && project.phases.length > 0) {
        for (const phase of project.phases) {
          const phaseNumber = Number(phase.phase) || 1;
          const requirements = phase.requirementItemIds || [];
          const requiredInPhase = requirements
            .filter(req => req.item_id === item.id)
            .reduce((sum, req) => sum + (Number(req.quantity) || 1), 0);

          const phaseStatus: 'completed' | 'requires_item' | 'open' = phaseNumber <= completedPhase
            ? 'completed'
            : requiredInPhase > 0
              ? 'requires_item'
              : 'open';

          phaseDetails.push({
            phase: phaseNumber,
            name: phase.name,
            requiredQuantity: requiredInPhase,
            status: phaseStatus
          });

          if (phaseNumber > completedPhase && requiredInPhase > 0) {
            requiredInProject = true;
            requiredQuantityInProject += requiredInPhase;
            const phaseLabel = phase.name
              ? `${project.name} (Phase ${phaseNumber}: ${phase.name}) x${requiredInPhase}`
              : `${project.name} (Phase ${phaseNumber}) x${requiredInPhase}`;
            phaseRequirements.push(phaseLabel);
          }
        }
      }

      if (requiredInProject) {
        projectNames.push(project.name);
        totalRequired += requiredQuantityInProject;
        details.push({
          kind: 'project',
          id: project.id,
          name: project.name,
          totalRequired: requiredQuantityInProject,
          description: project.description,
          phases: phaseDetails
        });
      }
    }

    return {
      isUsed: phaseRequirements.length > 0,
      projectNames,
      phaseRequirements,
      totalRequired,
      details
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
