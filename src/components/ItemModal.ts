import type { Item, DecisionReason } from '../types/Item';
import { dataLoader } from '../utils/dataLoader';

export interface ItemModalConfig {
  item: Item;
  decisionData: DecisionReason;
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
    const placeholderUrl = import.meta.env.BASE_URL + 'assets/icons/placeholder.png';
    const itemName = item.name['en'] || item.name[Object.keys(item.name)[0]];
    const description = item.description?.['en'] || item.description?.[Object.keys(item.description || {})[0]] || 'No description available';

    return `
      <div class="item-modal">
        <button class="modal-close" data-action="close">×</button>

        <div class="item-modal__header">
          <div class="item-modal__image-container">
            <img
              src="${iconUrl}"
              alt="${itemName}"
              class="item-modal__image"
              onerror="this.src='${placeholderUrl}'"
            />
          </div>
          <div class="item-modal__header-info">
            <h2 class="item-modal__name">${itemName}</h2>
            <div class="item-modal__badges">
              ${item.rarity ? `<span class="rarity-badge rarity-badge--${item.rarity}">${item.rarity}</span>` : ''}
              <span class="decision-badge decision-badge--${decisionData.decision}">
                ${this.getDecisionLabel(decisionData.decision)}
              </span>
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
                <span class="decision-analysis__confidence">${decisionData.confidence}% Confidence</span>
              </div>
              <ul class="decision-analysis__reasons">
                ${decisionData.reasons.map(reason => `<li>${reason}</li>`).join('')}
              </ul>
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
                <dd>${item.type}</dd>
                <dt>Value</dt>
                <dd>${item.value} coins</dd>
                <dt>Weight</dt>
                <dd>${item.weightKg} kg</dd>
                <dt>Stack Size</dt>
                <dd>${item.stackSize}</dd>
              </dl>
            </div>

            ${item.recyclesInto && item.recyclesInto.length > 0 ? `
              <div class="item-modal__section">
                <h3>Recycles Into</h3>
                <ul class="recycle-list">
                  ${item.recyclesInto.map(output => `
                    <li>${output.quantity}x ${output.itemId}</li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}

            ${item.recipe && item.recipe.length > 0 ? `
              <div class="item-modal__section">
                <h3>Crafting Recipe</h3>
                <ul class="recipe-list">
                  ${item.recipe.map(ingredient => `
                    <li>${ingredient.quantity}x ${ingredient.itemId}</li>
                  `).join('')}
                </ul>
                ${item.craftBench ? `<p class="craft-bench">Requires: ${item.craftBench}</p>` : ''}
              </div>
            ` : ''}

            ${item.foundIn && item.foundIn.length > 0 ? `
              <div class="item-modal__section">
                <h3>Found In</h3>
                <ul class="location-list">
                  ${item.foundIn.map(location => `<li>${location}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>

          ${item.tip?.['en'] ? `
            <div class="item-modal__section item-modal__tip">
              <h3>💡 Tip</h3>
              <p>${item.tip['en']}</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private getDecisionLabel(decision: string): string {
    const labels: Record<string, string> = {
      keep: 'KEEP',
      recycle: 'RECYCLE',
      sell: 'SELL',
      situational: 'REVIEW'
    };
    return labels[decision] || decision.toUpperCase();
  }
}
