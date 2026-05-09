import type { Item, DecisionReason, DecisionDependencyDetail } from '../types/Item';
import { dataLoader } from '../utils/dataLoader';
import { getMapRecommendations, getZoneInfo } from '../utils/zoneMapping';
import type { DecisionEngine } from '../utils/decisionEngine';
import { WeaponGrouper } from '../utils/weaponGrouping';
import { getEnemyDropInfo, isEnemyDrop } from '../utils/enemyDrops';
import { MapView } from './MapView';

export interface ItemModalConfig {
  item: Item;
  decisionData: DecisionReason;
  decisionEngine: DecisionEngine;
  onClose: () => void;
}

export class ItemModal {
  private config: ItemModalConfig;
  private modalElement: HTMLElement | null = null;
  private dependencyPopoverElement: HTMLElement | null = null;
  private static currentMapViewModal: HTMLElement | null = null;
  private static currentMapView: MapView | null = null;

  constructor(config: ItemModalConfig) {
    this.config = config;
  }

  async show(): Promise<void> {
    const modal = document.getElementById('item-modal');
    if (!modal) return;

    const content = modal.querySelector('.modal-content');
    if (!content) return;

    // Add will-change hints for smooth animations
    const overlay = modal.querySelector('.modal-overlay') as HTMLElement;
    if (overlay) overlay.style.willChange = 'opacity';
    (content as HTMLElement).style.willChange = 'opacity, transform';

    // Show modal immediately
    modal.classList.add('active');
    this.modalElement = modal;

    // Render content synchronously (lightweight without "Used to Craft")
    content.innerHTML = this.renderContent(false);

    // Defer event listener attachment to avoid blocking animation start
    requestAnimationFrame(() => {
      this.attachEventListeners(content, modal);

      // Remove will-change after animations complete (200ms)
      setTimeout(() => {
        if (overlay) overlay.style.willChange = 'auto';
        (content as HTMLElement).style.willChange = 'auto';
      }, 250);
    });

    // Load heavy "Used to Craft" section asynchronously when browser is idle
    this.loadUsedToCraftAsync(content);
  }

  hide(): void {
    this.hideDependencyPopover();
    if (this.modalElement) {
      this.modalElement.classList.remove('active');
      this.config.onClose();
    }
  }

  private attachEventListeners(content: Element, modal: HTMLElement): void {
    const closeBtn = content.querySelector('[data-action="close"]');
    const overlay = modal.querySelector('.modal-overlay');

    closeBtn?.addEventListener('click', () => this.hide());
    overlay?.addEventListener('click', () => this.hide());

    // Click handlers for recipe items
    const clickableItems = content.querySelectorAll('[data-item-id]');
    clickableItems.forEach(element => {
      element.addEventListener('click', (e) => {
        const itemId = (e.currentTarget as HTMLElement).getAttribute('data-item-id');
        if (itemId) {
          this.navigateToItem(itemId);
        }
      });
    });

    // View map button
    const viewMapBtn = content.querySelector('[data-action="view-map"]');
    viewMapBtn?.addEventListener('click', () => this.openMapView());

    // Hover popovers for quest/project dependencies
    this.attachDependencyHoverHandlers(content);
  }

  private loadUsedToCraftAsync(content: Element): void {
    const placeholder = content.querySelector('#used-to-craft-placeholder');
    if (!placeholder) return;

    // Use requestIdleCallback for non-blocking rendering
    const callback = () => {
      try {
        placeholder.outerHTML = this.renderUsedToCraft(this.config.item);

        // Re-attach handlers to new elements
        const newItems = content.querySelectorAll('[data-item-id]');
        newItems.forEach(element => {
          element.addEventListener('click', (e) => {
            const itemId = (e.currentTarget as HTMLElement).getAttribute('data-item-id');
            if (itemId) this.navigateToItem(itemId);
          });
        });
      } catch (error) {
        console.error('Failed to load recipes:', error);
        placeholder.innerHTML = '<p style="color: #888;">Failed to load recipes</p>';
      }
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: 2000 });
    } else {
      // Fallback for browsers without requestIdleCallback
      Promise.resolve().then(callback);
    }
  }

  private renderContent(includeUsedToCraft: boolean = true): string {
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
              ${this.renderDecisionDependencies(decisionData)}
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

            ${includeUsedToCraft ? this.renderUsedToCraft(item) : '<div id="used-to-craft-placeholder" class="modal-loading" style="min-height: 100px;">Loading recipes...</div>'}

            ${Array.isArray(item.foundIn) && item.foundIn.length > 0 ? `
              <div class="item-modal__section">
                <h3>Location & Maps</h3>

                <div class="location-zones">
                  <h4>Zone Types:</h4>
                  <div class="zone-badges">
                    ${item.foundIn.map(location => {
      const zoneInfo = getZoneInfo(location);
      return `<span class="zone-badge" style="--zone-color: ${zoneInfo?.color || '#6b7280'}" title="${zoneInfo?.description || location}">${location}</span>`;
    }).join('')}
                  </div>
                  <p class="zone-hint">Search for loot containers in these zone types</p>
                </div>

                ${this.renderEnemyDropInfo(item)}

                ${this.renderMapRecommendations(item.foundIn, item.id)}
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

  private renderEnemyDropInfo(item: Item): string {
    const enemyInfo = getEnemyDropInfo(item.id);
    if (!enemyInfo) {
      return '';
    }

    return `
      <div class="enemy-drop-info">
        <h4>Dropped By:</h4>
        <div class="enemy-badge">
          <span class="enemy-name">${enemyInfo.displayName}</span>
          ${enemyInfo.tier ? `<span class="enemy-tier enemy-tier--${enemyInfo.tier.toLowerCase()}">${enemyInfo.tier}</span>` : ''}
        </div>
        <p class="map-hint">Hunt ${enemyInfo.displayName} enemies to farm this item</p>
      </div>
    `;
  }

  private renderMapRecommendations(zones: string[], itemId: string): string {
    const maps = getMapRecommendations(zones);

    if (maps.length === 0) {
      return '';
    }

    // Handle Hideout vendor items
    if (maps.includes('Hideout')) {
      return `
        <div class="map-recommendations">
          <h4>Available At:</h4>
          <div class="vendor-info">
            <span class="map-badge map-badge--vendor">Hideout - Exodus Vendor</span>
            <p class="map-hint">Purchase this item from the Exodus faction vendor in your Hideout</p>
          </div>
        </div>
      `;
    }

    // Handle ARC enemy drops - available on all maps
    const hasEnemyInfo = isEnemyDrop(itemId);
    if (maps.includes('All Maps')) {
      return `
        <div class="map-recommendations">
          <h4>Where to Find:</h4>
          <div class="all-maps-info">
            <span class="map-badge map-badge--all">Available on All Maps</span>
            <p class="map-hint">${hasEnemyInfo ? 'Hunt ARC enemies on any raid map to farm this item' : 'Can be looted from enemies across all maps'}</p>
          </div>
        </div>
      `;
    }

    // Get zone details for helpful information
    const zoneDetails = zones.map(z => getZoneInfo(z)).filter(Boolean);
    const zoneCategories = new Set(zoneDetails.map(z => z!.category));

    // Create categorized zone description
    let zoneDescription = '';
    if (zoneCategories.has('building')) {
      const buildingZones = zoneDetails.filter(z => z!.category === 'building').map(z => z!.displayName);
      zoneDescription = `Look inside <strong>${buildingZones.join(', ')}</strong> buildings`;
    } else if (zoneCategories.has('environment')) {
      const envZones = zoneDetails.filter(z => z!.category === 'environment').map(z => z!.displayName);
      zoneDescription = `Search <strong>${envZones.join(', ')}</strong> areas`;
    } else {
      zoneDescription = `Search <strong>${zones.join(', ')}</strong> zones`;
    }

    return `
      <div class="map-recommendations">
        <h4>Map Locations:</h4>
        <button class="btn btn--map" data-action="view-map">
          View Interactive Map
        </button>
        <div class="location-help">
          <p class="map-hint">
            ${zoneDescription} - click "View Interactive Map" for precise locations
          </p>
        </div>
      </div>
    `;
  }

  private async openMapView(): Promise<void> {
    const { item } = this.config;

    // Close any existing map view modal first
    if (ItemModal.currentMapViewModal && ItemModal.currentMapView) {
      ItemModal.currentMapView.hide();
      if (ItemModal.currentMapViewModal.parentNode) {
        document.body.removeChild(ItemModal.currentMapViewModal);
      }
      ItemModal.currentMapViewModal = null;
      ItemModal.currentMapView = null;
    }

    // Create map view modal container
    const mapViewModal = document.createElement('div');
    mapViewModal.id = 'map-view-modal';
    mapViewModal.className = 'modal active';
    mapViewModal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content modal-content--map">
        <div id="map-view-container"></div>
      </div>
    `;

    document.body.appendChild(mapViewModal);

    // Create and initialize MapView
    const mapView = new MapView({
      item,
      onClose: () => {
        mapView.hide();
        document.body.removeChild(mapViewModal);
        ItemModal.currentMapViewModal = null;
        ItemModal.currentMapView = null;
      }
    });

    // Store current map view modal and instance
    ItemModal.currentMapViewModal = mapViewModal;
    ItemModal.currentMapView = mapView;

    try {
      await mapView.init();
      const container = mapViewModal.querySelector('#map-view-container') as HTMLElement;
      if (container) {
        mapView.render(container);
      }
    } catch (error) {
      console.error('Failed to load map view:', error);
      document.body.removeChild(mapViewModal);
      ItemModal.currentMapViewModal = null;
      ItemModal.currentMapView = null;
    }
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

  private renderDecisionDependencies(decisionData: DecisionReason): string {
    const details = decisionData.dependencyDetails || [];

    if (details.length > 0) {
      return `
        <div class="decision-analysis__dependencies">
          <strong>Required for:</strong>
          <div class="decision-analysis__dependency-list">
            ${details.map((detail, index) => {
        const quantity = detail.totalRequired && detail.totalRequired > 0
          ? ` x${detail.totalRequired}`
          : '';
        const badgeKind = detail.kind === 'quest' || detail.kind === 'project'
          ? detail.kind
          : 'other';
        return `<span class="decision-dependency decision-dependency--${badgeKind}" data-dependency-index="${index}">${this.escapeHtml(detail.name)}${quantity}</span>`;
      }).join('')}
          </div>
        </div>
      `;
    }

    if (decisionData.dependencies && decisionData.dependencies.length > 0) {
      return `
        <div class="decision-analysis__dependencies">
          <strong>Required for:</strong> ${decisionData.dependencies.map(dep => this.escapeHtml(dep)).join(', ')}
        </div>
      `;
    }

    return '';
  }

  private attachDependencyHoverHandlers(content: Element): void {
    const details = this.config.decisionData.dependencyDetails || [];
    if (details.length === 0) {
      return;
    }

    const dependencyElements = content.querySelectorAll('[data-dependency-index]');
    dependencyElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      const index = Number(htmlElement.dataset.dependencyIndex);
      if (!Number.isFinite(index) || !details[index]) {
        return;
      }

      const detail = details[index];
      if (detail.kind !== 'quest' && detail.kind !== 'project') {
        return;
      }

      htmlElement.addEventListener('mouseenter', () => {
        this.showDependencyPopover(detail, htmlElement);
      });

      htmlElement.addEventListener('mouseleave', () => {
        this.hideDependencyPopover();
      });
    });
  }

  private showDependencyPopover(detail: DecisionDependencyDetail, anchor: HTMLElement): void {
    this.hideDependencyPopover();

    const popover = document.createElement('div');
    popover.className = 'decision-dependency-popover';
    popover.innerHTML = this.buildDependencyPopoverContent(detail);

    document.body.appendChild(popover);
    this.dependencyPopoverElement = popover;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 8;

    let left = anchorRect.left + (anchorRect.width / 2) - (popoverRect.width / 2);
    let top = anchorRect.top - popoverRect.height - gap;

    if (left < viewportPadding) left = viewportPadding;
    if (left + popoverRect.width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - popoverRect.width - viewportPadding;
    }

    // Prefer showing above the anchor, but fall back below when needed.
    if (top < viewportPadding) {
      top = anchorRect.bottom + gap;
    }

    // Clamp to viewport bottom/top so the popup never renders off-screen.
    if (top + popoverRect.height > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, window.innerHeight - popoverRect.height - viewportPadding);
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  private buildDependencyPopoverContent(detail: DecisionDependencyDetail): string {
    const totalRequired = detail.totalRequired && detail.totalRequired > 0
      ? `<div class="decision-dependency-popover__meta">Total Required: ${detail.totalRequired}</div>`
      : '';

    if (detail.kind === 'quest') {
      const objectives = Array.isArray(detail.objectives) && detail.objectives.length > 0
        ? detail.objectives.map(step => `<li>${this.escapeHtml(step)}</li>`).join('')
        : '<li>No objectives listed</li>';
      const trader = detail.trader ? `<div class="decision-dependency-popover__meta">Trader: ${this.escapeHtml(detail.trader)}</div>` : '';
      const description = detail.description
        ? `<div class="decision-dependency-popover__desc">${this.escapeHtml(detail.description)}</div>`
        : '';

      return `
        <div class="decision-dependency-popover__title">Quest: ${this.escapeHtml(detail.name)}</div>
        ${trader}
        ${totalRequired}
        ${description}
        <div class="decision-dependency-popover__section-title">Steps</div>
        <ol class="decision-dependency-popover__list">${objectives}</ol>
      `;
    }

    if (detail.kind === 'project') {
      const description = detail.description
        ? `<div class="decision-dependency-popover__desc">${this.escapeHtml(detail.description)}</div>`
        : '';
      const phases = Array.isArray(detail.phases) && detail.phases.length > 0
        ? detail.phases
          .sort((a, b) => a.phase - b.phase)
          .map((phase) => {
            const phaseName = phase.name ? `: ${this.escapeHtml(phase.name)}` : '';
            const quantitySuffix = phase.requiredQuantity > 0 ? `: x${phase.requiredQuantity}` : '';
            return `<li class="decision-dependency-popover__phase decision-dependency-popover__phase--${phase.status}"><span class="decision-dependency-popover__phase-title">Phase ${phase.phase}${phaseName}${quantitySuffix}</span></li>`;
          })
          .join('')
        : '<li>No phase details listed</li>';

      return `
        <div class="decision-dependency-popover__title">Project: ${this.escapeHtml(detail.name)}</div>
        ${totalRequired}
        ${description}
        <div class="decision-dependency-popover__legend">
          <span class="decision-dependency-popover__legend-item decision-dependency-popover__legend-item--completed">Completed</span>
          <span class="decision-dependency-popover__legend-item decision-dependency-popover__legend-item--requires_item">Requires Item</span>
          <span class="decision-dependency-popover__legend-item decision-dependency-popover__legend-item--open">Open / No Requirement</span>
        </div>
        <div class="decision-dependency-popover__section-title">All Phases</div>
        <ol class="decision-dependency-popover__list">${phases}</ol>
      `;
    }

    return `<div class="decision-dependency-popover__title">${this.escapeHtml(detail.name)}</div>${totalRequired}`;
  }

  private hideDependencyPopover(): void {
    if (this.dependencyPopoverElement) {
      this.dependencyPopoverElement.remove();
      this.dependencyPopoverElement = null;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    // OPTIMIZATION: Don't recalculate ALL items - use cached version
    // Access private 'items' map directly to avoid scanning all 485 items
    const item = (this.config.decisionEngine as any).items.get(itemId);
    if (!item) return undefined;

    // Get the decision for just this specific item (much faster than getItemsWithDecisions)
    const decisionData = this.config.decisionEngine.getDecision(item, {
      completedQuests: [],
      completedProjects: [],
      projectPhaseProgress: {},
      hideoutLevels: {},
      lastUpdated: Date.now()
    });

    return { ...item, decisionData };
  }

  private findItemByIdSimple(itemId: string): Item | undefined {
    // FAST: Direct Map lookup without any decision calculation
    // This is called for every ingredient in recipes, so must be instant
    return (this.config.decisionEngine as any).items.get(itemId);
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
      onClose: () => { }
    });

    newModal.show();
  }
}
