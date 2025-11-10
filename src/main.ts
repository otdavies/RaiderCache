import './styles/main.css';
import { dataLoader, type GameData } from './utils/dataLoader';
import { DecisionEngine } from './utils/decisionEngine';
import { SearchEngine, type SearchableItem } from './utils/searchEngine';
import { StorageManager } from './utils/storage';
import type { UserProgress } from './types/UserProgress';
import type { Item, RecycleDecision } from './types/Item';
import { ItemCard } from './components/ItemCard';
import { ItemModal } from './components/ItemModal';

class App {
  private gameData!: GameData;
  private decisionEngine!: DecisionEngine;
  private searchEngine!: SearchEngine;
  private userProgress: UserProgress;
  private allItems: SearchableItem[] = [];
  private filteredItems: SearchableItem[] = [];

  private searchInput!: HTMLInputElement;
  private itemsGrid!: HTMLElement;
  private filters = {
    searchQuery: '',
    decisions: new Set<RecycleDecision>(),
    rarities: new Set<string>(),
    category: ''
  };

  constructor() {
    this.userProgress = StorageManager.loadUserProgress();
  }

  async init() {
    try {
      // Show loading state
      this.showLoading();

      // Load game data
      this.gameData = await dataLoader.loadGameData();

      // Initialize decision engine
      this.decisionEngine = new DecisionEngine(
        this.gameData.items,
        this.gameData.hideoutModules,
        this.gameData.quests,
        this.gameData.projects
      );

      // Get items with decisions
      this.allItems = this.decisionEngine.getItemsWithDecisions(this.userProgress);

      // Initialize search engine
      this.searchEngine = new SearchEngine(this.allItems);

      // Set filtered items to all items initially
      this.filteredItems = [...this.allItems];

      // Initialize UI
      this.initializeUI();

      // Render initial state
      this.render();

      // Update stats
      this.updateStats();

      // Update last updated time
      this.updateLastUpdated();

      // Hide loading
      this.hideLoading();

    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Failed to load data. Please refresh the page.');
    }
  }

  private initializeUI() {
    // Search input
    this.searchInput = document.getElementById('search') as HTMLInputElement;
    this.searchInput.addEventListener('input', (e) => {
      this.filters.searchQuery = (e.target as HTMLInputElement).value;
      this.applyFilters();
    });

    // Items grid
    this.itemsGrid = document.getElementById('items-grid')!;

    // Initialize filter buttons
    this.initializeDecisionFilters();
    this.initializeRarityFilters();
    this.initializeCategoryFilter();

    // Initialize dashboard
    this.initializeDashboard();

    // View toggle
    this.initializeViewToggle();

    // Initialize workshop tracker
    this.initializeWorkshopTracker();
  }

  private initializeDecisionFilters() {
    const filterContainer = document.getElementById('decision-filter');
    if (!filterContainer) return;

    const decisions: RecycleDecision[] = ['keep', 'recycle', 'sell', 'situational'];

    decisions.forEach(decision => {
      const button = document.createElement('button');
      button.className = 'filter-btn';
      button.dataset.decision = decision;
      button.textContent = decision.charAt(0).toUpperCase() + decision.slice(1);

      button.addEventListener('click', () => {
        if (this.filters.decisions.has(decision)) {
          this.filters.decisions.delete(decision);
          button.classList.remove('active');
        } else {
          this.filters.decisions.add(decision);
          button.classList.add('active');
        }
        this.applyFilters();
      });

      filterContainer.appendChild(button);
    });
  }

  private initializeRarityFilters() {
    const filterContainer = document.getElementById('rarity-filter');
    if (!filterContainer) return;

    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

    rarities.forEach(rarity => {
      const button = document.createElement('button');
      button.className = `filter-btn rarity-${rarity}`;
      button.dataset.rarity = rarity;
      button.textContent = rarity.charAt(0).toUpperCase() + rarity.slice(1);

      button.addEventListener('click', () => {
        if (this.filters.rarities.has(rarity)) {
          this.filters.rarities.delete(rarity);
          button.classList.remove('active');
        } else {
          this.filters.rarities.add(rarity);
          button.classList.add('active');
        }
        this.applyFilters();
      });

      filterContainer.appendChild(button);
    });
  }

  private initializeCategoryFilter() {
    const select = document.getElementById('category-filter') as HTMLSelectElement;
    if (!select) return;

    // Get unique categories
    const categories = new Set(this.allItems.map(item => item.type));

    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
      this.filters.category = (e.target as HTMLSelectElement).value;
      this.applyFilters();
    });
  }

  private initializeDashboard() {
    const dashboardCards = document.querySelectorAll('.dashboard-card');

    dashboardCards.forEach(card => {
      card.addEventListener('click', () => {
        const decision = card.classList[1] as RecycleDecision; // Second class is the decision type

        // Toggle filter
        const filterBtn = document.querySelector(`[data-decision="${decision}"]`);
        if (filterBtn) {
          (filterBtn as HTMLElement).click();
        }
      });
    });
  }

  private initializeViewToggle() {
    const toggleBtns = document.querySelectorAll('.toggle-btn');

    toggleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const view = target.dataset.view;

        toggleBtns.forEach(b => b.classList.remove('active'));
        target.classList.add('active');

        if (view === 'list') {
          this.itemsGrid.classList.add('list-view');
        } else {
          this.itemsGrid.classList.remove('list-view');
        }
      });
    });
  }

  private initializeWorkshopTracker() {
    const workshopGrid = document.getElementById('workshop-grid');
    if (!workshopGrid) return;

    this.gameData.hideoutModules.forEach(module => {
      const currentLevel = this.userProgress.hideoutLevels[module.id] || 1;
      const moduleName = module.name['en'] || module.name[Object.keys(module.name)[0]];

      const card = document.createElement('div');
      card.className = 'workshop-card';
      card.innerHTML = `
        <h3>${moduleName}</h3>
        <div class="workshop-card__level">
          <span>Level ${currentLevel} / ${module.maxLevel}</span>
          <input
            type="range"
            min="1"
            max="${module.maxLevel}"
            value="${currentLevel}"
            data-module-id="${module.id}"
            class="workshop-card__slider"
          />
        </div>
      `;

      const slider = card.querySelector('.workshop-card__slider') as HTMLInputElement;
      slider.addEventListener('change', (e) => {
        const newLevel = parseInt((e.target as HTMLInputElement).value);
        this.updateWorkshopLevel(module.id, newLevel);
      });

      workshopGrid.appendChild(card);
    });
  }

  private updateWorkshopLevel(moduleId: string, level: number) {
    this.userProgress.hideoutLevels[moduleId] = level;
    StorageManager.saveUserProgress(this.userProgress);

    // Recalculate decisions
    this.allItems = this.decisionEngine.getItemsWithDecisions(this.userProgress);
    this.searchEngine.updateIndex(this.allItems);

    // Re-apply filters and render
    this.applyFilters();
    this.updateStats();
  }

  private applyFilters() {
    let items = [...this.allItems];

    // Search filter
    if (this.filters.searchQuery.trim()) {
      items = this.searchEngine.search(this.filters.searchQuery);
    }

    // Decision filter
    if (this.filters.decisions.size > 0) {
      items = items.filter(item =>
        this.filters.decisions.has(item.decisionData.decision)
      );
    }

    // Rarity filter
    if (this.filters.rarities.size > 0) {
      items = items.filter(item =>
        item.rarity && this.filters.rarities.has(item.rarity)
      );
    }

    // Category filter
    if (this.filters.category) {
      items = items.filter(item => item.type === this.filters.category);
    }

    this.filteredItems = items;
    this.render();
  }

  private render() {
    this.itemsGrid.innerHTML = '';

    if (this.filteredItems.length === 0) {
      this.itemsGrid.innerHTML = '<div class="no-results">No items found matching your filters.</div>';
      return;
    }

    this.filteredItems.forEach(item => {
      const itemCard = new ItemCard({
        item,
        decisionData: item.decisionData,
        onClick: (clickedItem) => this.showItemModal(clickedItem)
      });

      this.itemsGrid.appendChild(itemCard.render());
    });

    // Update title
    const title = document.getElementById('items-title');
    if (title) {
      title.textContent = `Items (${this.filteredItems.length})`;
    }
  }

  private showItemModal(item: Item) {
    const itemWithDecision = this.allItems.find(i => i.id === item.id);
    if (!itemWithDecision) return;

    const modal = new ItemModal({
      item,
      decisionData: itemWithDecision.decisionData,
      onClose: () => {}
    });

    modal.show();
  }

  private updateStats() {
    const stats = this.decisionEngine.getDecisionStats(this.userProgress);

    this.updateStatElement('keep-count', stats.keep);
    this.updateStatElement('recycle-count', stats.recycle);
    this.updateStatElement('sell-count', stats.sell);
    this.updateStatElement('situational-count', stats.situational);
  }

  private updateStatElement(id: string, count: number) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    }
  }

  private updateLastUpdated() {
    const element = document.getElementById('last-update');
    if (element && this.gameData.metadata) {
      const date = new Date(this.gameData.metadata.lastUpdated);
      element.textContent = date.toLocaleString();
    }
  }

  private showLoading() {
    const app = document.getElementById('app');
    if (app) {
      app.classList.add('loading');
    }
  }

  private hideLoading() {
    const app = document.getElementById('app');
    if (app) {
      app.classList.remove('loading');
    }
  }

  private showError(message: string) {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="error-screen">
          <h1>Error</h1>
          <p>${message}</p>
          <button onclick="location.reload()">Reload Page</button>
        </div>
      `;
    }
  }
}

// Initialize app
const app = new App();
app.init();

// Collapsible sections functionality
document.addEventListener('DOMContentLoaded', () => {
  const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

  collapsibleHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const parent = header.closest('.collapsible');
      if (parent) {
        parent.classList.toggle('collapsed');
      }
    });
  });
});
