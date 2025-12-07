import type { Item } from '../types/Item';
import { getZonesByCategory, countItemsByZone } from '../utils/zoneMapping';

export interface ZoneFilterConfig {
  items: Item[];
  onZoneSelect: (zones: string[]) => void;
  selectedZones: string[];
}

export class ZoneFilter {
  private config: ZoneFilterConfig;
  private container: HTMLElement;

  constructor(config: ZoneFilterConfig) {
    this.config = config;
    this.container = this.createContainer();
    this.render();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'zone-filter-sidebar';
    return container;
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  public updateItems(items: Item[]): void {
    this.config.items = items;
    this.render();
  }

  private handleZoneClick(zone: string): void {
    const currentZones = [...this.config.selectedZones];
    const index = currentZones.indexOf(zone);

    if (index > -1) {
      // Remove zone
      currentZones.splice(index, 1);
    } else {
      // Add zone
      currentZones.push(zone);
    }

    // Update internal state before notifying parent
    this.config.selectedZones = currentZones;
    this.config.onZoneSelect(currentZones);
    this.render();
  }

  private render(): void {
    const zoneCounts = countItemsByZone(this.config.items);
    const allZones = Object.entries(zoneCounts).map(([name, count]) => ({ name, count }));

    this.container.innerHTML = `
      <div class="zone-list">
        ${allZones.map(({ name, count }) => this.renderZoneButton(name, count)).join('')}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderZoneButton(zoneName: string, count: number): string {
    const isSelected = this.config.selectedZones.includes(zoneName);
    const hasItems = count > 0;
    const zoneInfo = this.getZoneInfo(zoneName);

    return `
      <button
        class="zone-btn ${isSelected ? 'zone-btn--selected' : ''} ${!hasItems ? 'zone-btn--disabled' : ''}"
        data-zone="${zoneName}"
        ${!hasItems ? 'disabled' : ''}
        style="--zone-color: ${zoneInfo.color}"
        title="${zoneInfo.description}"
      >
        <span class="zone-btn__name">${zoneInfo.displayName}</span>
        <span class="zone-btn__count">${count}</span>
      </button>
    `;
  }

  private getZoneInfo(zoneName: string) {
    const zonesByCategory = getZonesByCategory();
    const allZones = [
      ...zonesByCategory.vendor,
      ...zonesByCategory.building,
      ...zonesByCategory.environment,
      ...zonesByCategory.enemy
    ];
    return allZones.find(z => z.name === zoneName) || {
      name: zoneName,
      displayName: zoneName,
      description: '',
      color: '#6b7280',
      category: 'building' as const,
      maps: []
    };
  }

  private attachEventListeners(): void {
    // Zone button clicks
    this.container.querySelectorAll('.zone-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const zone = (btn as HTMLElement).dataset.zone;
        if (zone) {
          this.handleZoneClick(zone);
        }
      });
    });
  }

  public destroy(): void {
    this.container.remove();
  }
}
