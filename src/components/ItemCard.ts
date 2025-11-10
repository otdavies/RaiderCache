import type { Item, DecisionReason, RecycleDecision } from '../types/Item';
import { dataLoader } from '../utils/dataLoader';
import { StorageManager } from '../utils/storage';

export interface ItemCardConfig {
  item: Item;
  decisionData: DecisionReason;
  onClick: (item: Item) => void;
}

export class ItemCard {
  private config: ItemCardConfig;
  private element: HTMLElement | null = null;
  private isFavorite: boolean = false;

  constructor(config: ItemCardConfig) {
    this.config = config;
    this.isFavorite = StorageManager.loadFavorites().has(config.item.id);
  }

  render(): HTMLElement {
    const { item, decisionData } = this.config;

    const card = document.createElement('div');
    const rarityClass = item.rarity ? `rarity-${item.rarity}` : 'rarity-common';
    card.className = `item-card ${rarityClass} decision-${decisionData.decision}`;
    card.dataset.itemId = item.id;

    const iconUrl = dataLoader.getIconUrl(item);
    const itemName = item.name?.['en'] || item.name?.[Object.keys(item.name || {})[0]] || '[Unknown Item]';
    const itemValue = item.value ?? 0;
    const stackSize = item.stackSize ?? 1;

    card.innerHTML = `
      <div class="item-card__header">
        <div class="item-card__rarity-badge">${this.getRarityLabel(item.rarity)}</div>
        <button class="item-card__favorite ${this.isFavorite ? 'active' : ''}" data-action="favorite">
          <span class="favorite-icon">${this.isFavorite ? '★' : '☆'}</span>
        </button>
      </div>

      <div class="item-card__image-container">
        <img
          src="${iconUrl}"
          alt="${itemName}"
          class="item-card__image"
          loading="lazy"
          onerror="this.outerHTML='<div class=\\'item-card__placeholder\\'>?</div>'"
        />
      </div>

      <div class="item-card__content">
        <h3 class="item-card__name">${itemName}</h3>

        <div class="item-card__meta">
          <span class="item-card__value">${itemValue} <span class="coin-icon">⚡</span></span>
          ${stackSize > 1 ? `<span class="item-card__stack">x${stackSize}</span>` : ''}
        </div>

        <div class="decision-badge decision-badge--${decisionData.decision}">
          <span class="decision-badge__icon">${this.getDecisionIcon(decisionData.decision)}</span>
          <span class="decision-badge__text">${this.getDecisionLabel(decisionData.decision)}</span>
        </div>
      </div>
    `;

    // Event listeners
    const favoriteBtn = card.querySelector('[data-action="favorite"]');

    favoriteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFavorite();
    });

    card.addEventListener('click', () => {
      this.config.onClick(item);
    });

    this.element = card;
    return card;
  }

  private toggleFavorite(): void {
    this.isFavorite = StorageManager.toggleFavorite(this.config.item.id);

    if (this.element) {
      const favoriteBtn = this.element.querySelector('[data-action="favorite"]');
      const favoriteIcon = this.element.querySelector('.favorite-icon');

      if (favoriteBtn) {
        favoriteBtn.classList.toggle('active', this.isFavorite);
      }

      if (favoriteIcon) {
        favoriteIcon.textContent = this.isFavorite ? '★' : '☆';
      }
    }
  }

  private getRarityLabel(rarity: string | undefined): string {
    if (!rarity) return 'Common';
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  }

  private getDecisionIcon(decision: RecycleDecision): string {
    const icons: Record<RecycleDecision, string> = {
      keep: '🛡️',
      sell_or_recycle: '💰',
      situational: '❓'
    };
    return icons[decision] || '❓';
  }

  private getDecisionLabel(decision: RecycleDecision): string {
    const labels: Record<RecycleDecision, string> = {
      keep: 'KEEP',
      sell_or_recycle: 'SAFE TO SELL',
      situational: 'YOUR CALL'
    };
    return labels[decision] || 'UNKNOWN';
  }

  destroy(): void {
    this.element = null;
  }
}
