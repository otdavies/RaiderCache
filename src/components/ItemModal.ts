import type { Item, DecisionReason } from '../types/Item';
import { dataLoader } from '../utils/dataLoader';
import { getMapRecommendations, getZoneInfo } from '../utils/zoneMapping';
import type { DecisionEngine } from '../utils/decisionEngine';
import { WeaponGrouper } from '../utils/weaponGrouping';

export interface ItemModalConfig {
  item: Item;
  decisionData: DecisionReason;
  decisionEngine: DecisionEngine;
  onClose: () => void;
}

export class ItemModal {
  private config: ItemModalConfig;
  private modalElement: HTMLElement | null = null;

  constructor(config: ItemModalConfig) {
    this.config = config;
  }

  show(): void {
    const modal = document.getElementById('item-modal');
    if (!modal) return;

    const content = modal.querySelector('.modal-content');
    if (!content) return;

    content.innerHTML = this.renderContent();

    // Event listeners
    const closeBtn = content.querySelector('[data-action="close"]');
    const overlay = modal.querySelector('.modal-overlay');

    closeBtn?.addEventListener('click', () => this.hide());
    overlay?.addEventListener('click', () => this.hide());

    // Add click handlers for clickable items in recipes
    const clickableItems = content.querySelectorAll('[data-item-id]');
    clickableItems.forEach(element => {
      element.addEventListener('click', (e) => {
        const itemId = (e.currentTarget as HTMLElement).getAttribute('data-item-id');
        if (itemId) {
          this.navigateToItem(itemId);
        }
      });
    });

    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    this.modalElement = modal;
  }

  hide(): void {
    if (this.modalElement) {
      this.modalElement.classList.remove('active');
      document.body.style.overflow = '';
      this.config.onClose();
    }
  }

  private renderContent(): string {
    const { item, decisionData } = this.config;
    const iconUrl = dataLoader.getIconUrl(item);
    const itemName = item.name || '[Unknown Item]';
    const description = item.description || 'No description available.';
    const itemValue = item.value ?? 0;
    const itemWeight = item.weightKg ?? 0;
    const itemStack = item.stackSize ?? 1;

    return `
      <div class="item-modal">
        <button class="modal-close" data-action="close">×</button>

        <div class="item-modal__header">
          <div class="item-modal__image-container">
            <img
              src="${iconUrl}"
              alt="${itemName}"
              class="item-modal__image"
              onerror="this.outerHTML='<div class=\\'item-modal__placeholder\\'>?</div>'"
            />
          </div>
          <div class="item-modal__header-info">
            <h2 class="item-modal__name">${itemName}</h2>
            <div class="item-modal__badges">
              ${item.rarity ? `<span class="rarity-badge rarity-badge--${item.rarity}">${item.rarity}</span>` : '<span class="rarity-badge rarity-badge--unknown">Unknown</span>'}
              <span class="decision-badge decision-badge--${decisionData.decision}">
                ${this.getDecisionLabel(decisionData.decision)}
              </span>
              ${decisionData.recycleValueExceedsItem ? '<span class="recycle-value-badge">Recycle > Sell</span>' : ''}
            </div>
          </div>
        </div>

        <div class="item-modal__body">
          <div class="item-modal__section">
            <h3>Description</h3>
            <p>${description}</p>
          </div>

          <div class="item-modal__section">
            <h3>Decision Analysis</h3>
            <div class="decision-analysis">
              <div class="decision-analysis__header">
                <span class="decision-analysis__decision decision-${decisionData.decision}">
                  ${this.getDecisionLabel(decisionData.decision)}
                </span>
              </div>
              ${this.renderDecisionReasons(decisionData)}
              ${decisionData.dependencies && decisionData.dependencies.length > 0 ? `
                <div class="decision-analysis__dependencies">
                  <strong>Required for:</strong> ${decisionData.dependencies.join(', ')}
                </div>
              ` : ''}
            </div>
          </div>

          <div class="item-modal__grid">
            <div class="item-modal__section">
              <h3>Properties</h3>
              <dl class="property-list">
                <dt>Type</dt>
                <dd>${item.type || 'Unknown'}</dd>
                <dt>Value</dt>
                <dd>${itemValue} coins</dd>
                <dt>Weight</dt>
                <dd>${itemWeight} kg</dd>
                <dt>Stack Size</dt>
                <dd>${itemStack}</dd>
              </dl>
            </div>

            ${this.renderRecyclesInto(item)}

            ${this.renderCraftingRecipe(item)}

            ${this.renderUsedToCraft(item)}

            ${Array.isArray(item.foundIn) && item.foundIn.length > 0 ? `
              <div class="item-modal__section">
                <h3>Location & Maps</h3>

                <div class="location-zones">
                  <h4>Found In:</h4>
                  <div class="zone-badges">
                    ${item.foundIn.map(location => {
                      const zoneInfo = getZoneInfo(location);
                      return `<span class="zone-badge" style="--zone-color: ${zoneInfo?.color || '#6b7280'}" title="${zoneInfo?.description || location}">${location}</span>`;
                    }).join('')}
                  </div>
                </div>

                ${this.renderMapRecommendations(item.foundIn)}
              </div>
            ` : ''}
          </div>

          ${item.tip ? `
            <div class="item-modal__section item-modal__tip">
              <h3>💡 Tip</h3>
              <p>${item.tip}</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderMapRecommendations(zones: string[]): string {
    const maps = getMapRecommendations(zones);

    if (maps.length === 0) {
      return '';
    }

    // Handle special cases
    if (maps.includes('Hideout')) {
      return `
        <div class="map-recommendations">
          <h4>Available At:</h4>
          <div class="map-badges">
            <span class="map-badge map-badge--vendor">Hideout Vendor</span>
          </div>
        </div>
      `;
    }

    if (maps.includes('All Maps')) {
      return `
        <div class="map-recommendations">
          <h4>Check Maps:</h4>
          <div class="map-badges">
            <span class="map-badge map-badge--all">All Raid Maps</span>
          </div>
          <p class="map-hint">Can be looted from enemies on any map</p>
        </div>
      `;
    }

    return `
      <div class="map-recommendations">
        <h4>Check Maps:</h4>
        <div class="map-badges">
          ${maps.map(map => `<span class="map-badge">${map}</span>`).join('')}
        </div>
        <p class="map-hint">Look for ${zones.join(', ')} zones on these maps</p>
      </div>
    `;
  }

  private getDecisionLabel(decision: string): string {
    const labels: Record<string, string> = {
      keep: 'KEEP',
      sell_or_recycle: 'SAFE TO SELL',
      situational: 'REVIEW'
    };
    return labels[decision] || decision.toUpperCase();
  }

  private renderDecisionReasons(decisionData: DecisionReason): string {
    let reasons = decisionData.reasons;

    // If dependencies exist, filter out dependency-related reasons to avoid duplication
    if (decisionData.dependencies && decisionData.dependencies.length > 0) {
      const dependencyPrefixes = [
        'Required for quest:',
        'Needed for project:',
        'Required for hideout upgrade:'
      ];

      reasons = reasons.filter(reason => {
        return !dependencyPrefixes.some(prefix => reason.startsWith(prefix));
      });
    }

    // If we have reasons left, render them
    if (reasons.length > 0) {
      return `
        <ul class="decision-analysis__reasons">
          ${reasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      `;
    }

    return '';
  }

  private renderRecyclesInto(item: Item): string {
    const isBlueprint = item.type.toLowerCase().includes('blueprint');
    if (isBlueprint) {
      return '';
    }

    // Check for recyclesInto, salvagesInto, or crafting properties
    const recycleData = item.recyclesInto || item.salvagesInto || item.crafting;
    if (!recycleData || Object.keys(recycleData).length === 0) {
      return '';
    }

    const recycleItems = Object.entries(recycleData)
      .map(([itemId, quantity]) => {
        const outputItem = this.findItemByIdSimple(itemId);
        const iconUrl = outputItem ? dataLoader.getIconUrl(outputItem) : '';
        const itemName = outputItem?.name || itemId;
        const rarity = (outputItem?.rarity || 'common').toLowerCase();

        return `
          <div class="recipe-item" data-item-id="${itemId}" title="${itemName}">
            <div class="recipe-item__icon recipe-item__icon--${rarity}">
              <img src="${iconUrl}" alt="${itemName}" onerror="this.outerHTML='<div class=\\'recipe-item__placeholder\\'>?</div>'" />
              <span class="recipe-item__quantity">${quantity}</span>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="item-modal__section">
        <h3>Recycles Into</h3>
        <div class="recipe-grid">
          ${recycleItems}
        </div>
      </div>
    `;
  }

  private renderCraftingRecipe(item: Item): string {
    const isWeapon = item.type === 'Weapon' || item.type.toLowerCase().includes('weapon') || item.type.toLowerCase().includes('rifle') || item.type.toLowerCase().includes('pistol') || item.type.toLowerCase().includes('shotgun');

    // Check if this is a weapon tier with upgrade cost
    const hasUpgradeCost = item.upgradeCost && Object.keys(item.upgradeCost).length > 0;
    const hasRecipe = item.recipe && Object.keys(item.recipe).length > 0;
    const tierNumber = WeaponGrouper.getTierNumber(item.id);

    // Higher tier weapons (II, III, IV) use upgradeCost
    if (hasUpgradeCost && tierNumber > 1) {
      const upgradeItems = Object.entries(item.upgradeCost!)
        .map(([ingredientId, quantity]) => {
          const ingredientItem = this.findItemByIdSimple(ingredientId);
          const iconUrl = ingredientItem ? dataLoader.getIconUrl(ingredientItem) : '';
          const itemName = ingredientItem?.name || ingredientId;
          const rarity = (ingredientItem?.rarity || 'common').toLowerCase();

          return `
            <div class="recipe-item" data-item-id="${ingredientId}" title="${itemName}">
              <div class="recipe-item__icon recipe-item__icon--${rarity}">
                <img src="${iconUrl}" alt="${itemName}" onerror="this.outerHTML='<div class=\\'recipe-item__placeholder\\'>?</div>'" />
                <span class="recipe-item__quantity">${quantity}</span>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="item-modal__section">
          <h3>Upgrade Cost</h3>
          <p class="recipe-description">Materials needed to upgrade from Tier ${this.numberToRoman(tierNumber - 1)} to Tier ${this.numberToRoman(tierNumber)}:</p>
          <div class="recipe-grid">
            ${upgradeItems}
          </div>
        </div>
      `;
    }

    // Tier I weapons or items with recipes
    if (hasRecipe) {
      const recipeItems = Object.entries(item.recipe!)
        .map(([ingredientId, quantity]) => {
          const ingredientItem = this.findItemByIdSimple(ingredientId);
          const iconUrl = ingredientItem ? dataLoader.getIconUrl(ingredientItem) : '';
          const itemName = ingredientItem?.name || ingredientId;
          const rarity = (ingredientItem?.rarity || 'common').toLowerCase();

          return `
            <div class="recipe-item" data-item-id="${ingredientId}" title="${itemName}">
              <div class="recipe-item__icon recipe-item__icon--${rarity}">
                <img src="${iconUrl}" alt="${itemName}" onerror="this.outerHTML='<div class=\\'recipe-item__placeholder\\'>?</div>'" />
                <span class="recipe-item__quantity">${quantity}</span>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="item-modal__section">
          <h3>Crafting Recipe</h3>
          <p class="recipe-description">Ingredients needed to craft this item:</p>
          <div class="recipe-grid">
            ${recipeItems}
          </div>
          ${item.craftBench ? `<p class="craft-bench">Requires: ${item.craftBench}</p>` : ''}
        </div>
      `;
    }

    // For weapons without recipe or upgrade cost
    if (isWeapon) {
      return `
        <div class="item-modal__section">
          <h3>Crafting Recipe</h3>
          <p class="recipe-description recipe-description--missing">Crafting recipe data missing for this weapon.</p>
        </div>
      `;
    }

    // For non-weapons without recipes, don't show the section
    return '';
  }

  private numberToRoman(num: number): string {
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return romanNumerals[num - 1] || String(num);
  }

  private renderUsedToCraft(item: Item): string {
    const usedInItems = this.config.decisionEngine.getItemsUsingIngredient(item.id);

    if (usedInItems.length === 0) {
      return '';
    }

    const itemsList = usedInItems
      .map(craftableItem => {
        const name = craftableItem.name || craftableItem.id;
        const quantity = craftableItem.recipe?.[item.id] || 0;
        const iconUrl = dataLoader.getIconUrl(craftableItem);
        const rarity = (craftableItem.rarity || 'common').toLowerCase();

        return `
          <div class="recipe-item" data-item-id="${craftableItem.id}" title="${name}">
            <div class="recipe-item__icon recipe-item__icon--${rarity}">
              <img src="${iconUrl}" alt="${name}" onerror="this.outerHTML='<div class=\\'recipe-item__placeholder\\'>?</div>'" />
              <span class="recipe-item__quantity">${quantity}</span>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="item-modal__section">
        <h3>Used to Craft</h3>
        <p class="recipe-description">This item is used as an ingredient in ${usedInItems.length} recipe${usedInItems.length > 1 ? 's' : ''}:</p>
        <div class="recipe-grid">
          ${itemsList}
        </div>
      </div>
    `;
  }

  private findItemById(itemId: string): (Item & { decisionData: DecisionReason }) | undefined {
    const items = this.config.decisionEngine.getItemsWithDecisions({
      completedQuests: [],
      completedProjects: [],
      hideoutLevels: {},
      lastUpdated: Date.now()
    });
    return items.find(i => i.id === itemId);
  }

  private findItemByIdSimple(itemId: string): Item | undefined {
    const itemWithDecision = this.findItemById(itemId);
    if (!itemWithDecision) return undefined;

    // Return a plain Item without the decisionData property
    const { decisionData, ...item } = itemWithDecision;
    return item as Item;
  }

  private navigateToItem(itemId: string): void {
    // Close current modal
    this.hide();

    // Find and show the new item
    const targetItem = this.findItemById(itemId);
    if (!targetItem) return;

    // Show new modal with the target item
    const newModal = new ItemModal({
      item: targetItem,
      decisionData: targetItem.decisionData,
      decisionEngine: this.config.decisionEngine,
      onClose: () => {}
    });

    newModal.show();
  }
}
