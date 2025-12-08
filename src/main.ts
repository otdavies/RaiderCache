import './styles/main.css';
import { dataLoader, type GameData } from './utils/dataLoader';
import { DecisionEngine } from './utils/decisionEngine';
import { SearchEngine, type SearchableItem } from './utils/searchEngine';
import { StorageManager } from './utils/storage';
import type { UserProgress } from './types/UserProgress';
import type { Item, RecycleDecision } from './types/Item';
import { ItemCard } from './components/ItemCard';
import { ItemModal } from './components/ItemModal';
import { ZoneFilter } from './components/ZoneFilter';
import { showPvPGateModal } from './components/PvPGateModal';

class App {
  private gameData!: GameData;
  private decisionEngine!: DecisionEngine;
  private searchEngine!: SearchEngine;
  private userProgress: UserProgress;
  private allItems: SearchableItem[] = [];
  private filteredItems: SearchableItem[] = [];
  private zoneFilter!: ZoneFilter;

  private searchInput!: HTMLInputElement;
  private itemsGrid!: HTMLElement;
  private searchDebounceTimer: number | null = null;
  private filters = {
    searchQuery: '',
    decisions: new Set<RecycleDecision>(),
    rarities: new Set<string>(),
    categories: new Map<string, 'include' | 'exclude'>(),
    zones: [] as string[],
    sortBy: 'name' as 'name' | 'value' | 'rarity' | 'weight' | 'decision',
    sortDirection: 'asc' as 'asc' | 'desc'
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

      // Filter out blacklisted garbage items
      const itemBlacklist = ['refinement-1'];
      this.allItems = this.allItems.filter(item => !itemBlacklist.includes(item.id));

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
    // Search input with debouncing
    this.searchInput = document.getElementById('search') as HTMLInputElement;
    this.searchInput.addEventListener('input', (e) => {
      this.filters.searchQuery = (e.target as HTMLInputElement).value;

      // Clear existing timer
      if (this.searchDebounceTimer !== null) {
        clearTimeout(this.searchDebounceTimer);
      }

      // Set new timer to apply filters after 300ms of no typing
      this.searchDebounceTimer = setTimeout(() => {
        this.applyFilters();
        this.searchDebounceTimer = null;
      }, 300) as unknown as number;
    });

    // Items grid
    this.itemsGrid = document.getElementById('items-grid')!;

    // Initialize filter buttons
    this.initializeDecisionFilters();
    this.initializeRarityFilters();
    this.initializeCategoryFilter();
    this.initializeSortSelector();

    // Initialize dashboard
    this.initializeDashboard();

    // View toggle
    this.initializeViewToggle();

    // Initialize workshop tracker
    this.initializeWorkshopTracker();

    // Initialize zone filter
    this.initializeZoneFilter();

    // Initialize mobile menu
    this.initializeMobileMenu();
  }

  private initializeDecisionFilters() {
    const filterContainer = document.getElementById('decision-filter');
    if (!filterContainer) return;

    const decisions: RecycleDecision[] = ['keep', 'sell_or_recycle', 'situational'];
    const labels: Record<RecycleDecision, string> = {
      keep: 'Keep',
      sell_or_recycle: 'Safe to Sell',
      situational: 'Your Call'
    };

    decisions.forEach(decision => {
      const button = document.createElement('button');
      button.className = 'filter-btn';
      button.dataset.decision = decision;
      button.textContent = labels[decision];

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

  // Normalize category names to handle case variations and similar names
  private normalizeCategory(type: string): string {
    const normalized = type.trim();
    const lower = normalized.toLowerCase();

    // Map similar/variant names to canonical forms
    const categoryMap: Record<string, string> = {
      'quick use': 'Quick Use',
      'quick_use': 'Quick Use',
      'consumable': 'Quick Use',
      'medical': 'Quick Use',
      'throwable': 'Quick Use',
      'mods': 'Modification',
      'mod': 'Modification',
      'modifications': 'Modification',
      'material': 'Basic Material',
      'quest item': 'Quest Item',
      'quest_item': 'Quest Item',
      'questitem': 'Quest Item',
    };

    return categoryMap[lower] || normalized;
  }

  // Get the normalized category for an item
  private getItemCategory(item: { type: string }): string {
    return this.normalizeCategory(item.type);
  }

  private initializeCategoryFilter() {
    const container = document.getElementById('category-filter');
    const resetBtn = document.getElementById('category-reset');
    if (!container) return;

    // Load saved category filters
    const savedFilters = StorageManager.loadCategoryFilters();
    const hasExistingSave = savedFilters.size > 0;
    this.filters.categories = savedFilters;

    // Default excludes for new users (no saved state)
    const defaultExcludes = ['Blueprint', 'Cosmetic', 'Misc'];

    // Get unique normalized categories sorted alphabetically
    const categories = [...new Set(this.allItems.map(item => this.getItemCategory(item)))].sort();

    // Create toggle buttons for each category
    categories.forEach(category => {
      const button = document.createElement('button');
      button.className = 'filter-btn category-btn';
      button.dataset.category = category;

      // Apply saved state, or default excludes for new users, or neutral
      let state: 'neutral' | 'include' | 'exclude' = 'neutral';
      if (hasExistingSave) {
        state = this.filters.categories.get(category) || 'neutral';
      } else if (defaultExcludes.includes(category)) {
        state = 'exclude';
        this.filters.categories.set(category, 'exclude');
      }
      button.dataset.state = state;
      button.textContent = category;

      button.addEventListener('click', () => {
        const currentState = button.dataset.state;
        let newState: 'neutral' | 'include' | 'exclude';

        // Cycle: neutral -> include -> exclude -> neutral
        if (currentState === 'neutral') {
          newState = 'include';
          this.filters.categories.set(category, 'include');
        } else if (currentState === 'include') {
          newState = 'exclude';
          this.filters.categories.set(category, 'exclude');
        } else {
          newState = 'neutral';
          this.filters.categories.delete(category);
        }

        button.dataset.state = newState;
        StorageManager.saveCategoryFilters(this.filters.categories);
        this.applyFilters();
      });

      container.appendChild(button);
    });

    // Reset button clears all category filters
    resetBtn?.addEventListener('click', () => {
      this.filters.categories.clear();
      StorageManager.saveCategoryFilters(this.filters.categories);
      container.querySelectorAll('.category-btn').forEach(btn => {
        (btn as HTMLElement).dataset.state = 'neutral';
      });
      this.applyFilters();
    });

    // Apply saved filters on load
    if (this.filters.categories.size > 0) {
      this.applyFilters();
    }
  }

  private initializeSortSelector() {
    const select = document.getElementById('sort-selector') as HTMLSelectElement;
    if (!select) return;

    select.addEventListener('change', (e) => {
      this.filters.sortBy = (e.target as HTMLSelectElement).value as any;
      this.applyFilters();
    });

    // Sort direction toggle
    const directionBtn = document.getElementById('sort-direction-btn');
    if (directionBtn) {
      directionBtn.addEventListener('click', () => {
        this.filters.sortDirection = this.filters.sortDirection === 'asc' ? 'desc' : 'asc';
        this.updateSortDirectionButton();
        this.applyFilters();
      });
      this.updateSortDirectionButton();
    }
  }

  private updateSortDirectionButton() {
    const btn = document.getElementById('sort-direction-btn');
    if (!btn) return;

    const isAsc = this.filters.sortDirection === 'asc';
    btn.innerHTML = isAsc ? '↑' : '↓';
    btn.title = isAsc ? 'Sort ascending' : 'Sort descending';
    btn.setAttribute('data-direction', this.filters.sortDirection);
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
    const isMobile = window.innerWidth <= 768;

    // Set default view based on screen size
    if (isMobile) {
      this.itemsGrid.classList.add('list-view');
      toggleBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-view') === 'list') {
          btn.classList.add('active');
        }
      });
    }

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

  private initializeMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const dropdown = document.getElementById('mobile-menu-dropdown');
    const filtersBtn = document.getElementById('mobile-filters-btn');
    const mobileSortSelect = document.getElementById('mobile-sort-selector') as HTMLSelectElement;
    const mobileViewBtns = document.querySelectorAll('.mobile-view-btn');
    const sidebar = document.querySelector('.sidebar');

    if (!menuBtn || !dropdown) return;

    // Toggle dropdown
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Filters button - open sidebar as modal
    if (filtersBtn && sidebar) {
      // Create overlay if it doesn't exist
      let overlay = document.querySelector('.sidebar-modal-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-modal-overlay';
        document.body.appendChild(overlay);
      }

      const openModal = () => {
        sidebar.classList.add('mobile-modal');
        overlay!.classList.add('open');
        dropdown.classList.remove('open');
      };

      const closeModal = () => {
        sidebar.classList.remove('mobile-modal');
        overlay!.classList.remove('open');
      };

      filtersBtn.addEventListener('click', openModal);
      overlay.addEventListener('click', closeModal);
    }

    // Sync mobile sort with desktop
    if (mobileSortSelect) {
      const desktopSort = document.getElementById('sort-selector') as HTMLSelectElement;

      mobileSortSelect.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value;
        this.filters.sortBy = value as any;
        if (desktopSort) desktopSort.value = value;
        this.applyFilters();
      });
    }

    // Mobile view toggle
    mobileViewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = (btn as HTMLElement).dataset.view;

        mobileViewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Sync with desktop toggle
        const desktopBtns = document.querySelectorAll('.toggle-btn');
        desktopBtns.forEach(b => {
          b.classList.remove('active');
          if ((b as HTMLElement).dataset.view === view) {
            b.classList.add('active');
          }
        });

        if (view === 'list') {
          this.itemsGrid.classList.add('list-view');
        } else {
          this.itemsGrid.classList.remove('list-view');
        }
      });
    });

    // Set initial active state for mobile view buttons (always list on mobile)
    mobileViewBtns.forEach(btn => {
      btn.classList.remove('active');
      if ((btn as HTMLElement).dataset.view === 'list') {
        btn.classList.add('active');
      }
    });
  }

  private initializeWorkshopTracker() {
    const workshopGrid = document.getElementById('workshop-grid');
    if (!workshopGrid) return;

    // Filter out stash and workbench as they're not relevant for this tool
    const relevantModules = this.gameData.hideoutModules.filter(
      module => module.id !== 'stash' && module.id !== 'workbench'
    );

    relevantModules.forEach(module => {
      const currentLevel = this.userProgress.hideoutLevels[module.id] ?? 0;
      const moduleName = module.name;

      const getLevelText = (level: number) => {
        return level === 0 ? 'Not Unlocked' : `Level ${level} / ${module.maxLevel}`;
      };

      const card = document.createElement('div');
      card.className = 'workshop-card';
      card.innerHTML = `
        <h3>${moduleName}</h3>
        <div class="workshop-card__level">
          <span class="workshop-card__level-text">${getLevelText(currentLevel)}</span>
          <input
            type="range"
            min="0"
            max="${module.maxLevel}"
            value="${currentLevel}"
            data-module-id="${module.id}"
            class="workshop-card__slider"
          />
        </div>
      `;

      const slider = card.querySelector('.workshop-card__slider') as HTMLInputElement;
      const levelText = card.querySelector('.workshop-card__level-text') as HTMLSpanElement;

      slider.addEventListener('input', (e) => {
        const newLevel = parseInt((e.target as HTMLInputElement).value);
        levelText.textContent = getLevelText(newLevel);
      });

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

  private initializeZoneFilter() {
    this.zoneFilter = new ZoneFilter({
      items: this.allItems,
      selectedZones: this.filters.zones,
      onZoneSelect: (zones: string[]) => {
        this.filters.zones = zones;
        this.applyFilters();
      }
    });

    // Mount to zone filter container in sidebar
    const zoneFilterContainer = document.getElementById('zone-filter-container');
    if (zoneFilterContainer) {
      this.zoneFilter.mount(zoneFilterContainer);
    }
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
        item.rarity && this.filters.rarities.has(item.rarity.toLowerCase())
      );
    }

    // Category filter (three-state: include takes priority over exclude)
    // Uses normalized categories for case-insensitive and fuzzy matching
    if (this.filters.categories.size > 0) {
      const included = [...this.filters.categories.entries()]
        .filter(([_, state]) => state === 'include')
        .map(([cat]) => cat);
      const excluded = [...this.filters.categories.entries()]
        .filter(([_, state]) => state === 'exclude')
        .map(([cat]) => cat);

      if (included.length > 0) {
        // Include mode: show ONLY included categories
        items = items.filter(item => included.includes(this.getItemCategory(item)));
      } else if (excluded.length > 0) {
        // Exclude mode: hide excluded categories
        items = items.filter(item => !excluded.includes(this.getItemCategory(item)));
      }
    }

    // Zone filter
    if (this.filters.zones.length > 0) {
      items = items.filter(item => {
        if (!item.foundIn || item.foundIn.length === 0) return false;
        // Item must be found in at least one of the selected zones
        return item.foundIn.some(zone => this.filters.zones.includes(zone));
      });
    }

    // Sort items
    items = this.sortItems(items);

    this.filteredItems = items;

    // Update zone filter with current items (for count display)
    if (this.zoneFilter) {
      this.zoneFilter.updateItems(items);
    }

    this.render();
  }

  private sortItems(items: SearchableItem[]): SearchableItem[] {
    const rarityOrder = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
    const decisionOrder = { keep: 3, situational: 2, sell_or_recycle: 1 };
    const direction = this.filters.sortDirection === 'asc' ? 1 : -1;

    return [...items].sort((a, b) => {
      let result = 0;

      switch (this.filters.sortBy) {
        case 'name':
          const nameA = a.name || '';
          const nameB = b.name || '';
          result = nameA.localeCompare(nameB);
          break;

        case 'value':
          result = (a.value || 0) - (b.value || 0);
          break;

        case 'rarity':
          const rarityA = rarityOrder[a.rarity?.toLowerCase() as keyof typeof rarityOrder] || 0;
          const rarityB = rarityOrder[b.rarity?.toLowerCase() as keyof typeof rarityOrder] || 0;
          result = rarityA - rarityB;
          break;

        case 'weight':
          result = (a.weightKg || 0) - (b.weightKg || 0);
          break;

        case 'decision':
          const decisionA = decisionOrder[a.decisionData.decision as keyof typeof decisionOrder] || 0;
          const decisionB = decisionOrder[b.decisionData.decision as keyof typeof decisionOrder] || 0;
          result = decisionA - decisionB;
          break;

        default:
          result = 0;
      }

      return result * direction;
    });
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
  }

  private showItemModal(item: Item) {
    const itemWithDecision = this.allItems.find(i => i.id === item.id);
    if (!itemWithDecision) return;

    const modal = new ItemModal({
      item,
      decisionData: itemWithDecision.decisionData,
      decisionEngine: this.decisionEngine,
      onClose: () => {}
    });

    modal.show();
  }

  private updateStats() {
    const stats = this.decisionEngine.getDecisionStats(this.userProgress);

    this.updateStatElement('keep-count', stats.keep);
    this.updateStatElement('sell-or-recycle-count', stats.sell_or_recycle);
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

// Bootstrap with PvP gate check
async function bootstrap() {
  const REDDIT_URL = 'https://www.reddit.com/r/ArcRaiders/';
  const answer = StorageManager.getPvPGateAnswer();

  // Already answered 4-5: redirect
  if (answer !== null && answer >= 4) {
    window.location.href = REDDIT_URL;
    return;
  }

  // Already answered 1-3: proceed
  if (answer !== null && answer <= 3) {
    new App().init();
    return;
  }

  // No answer: show modal
  const selected = await showPvPGateModal();
  StorageManager.setPvPGateAnswer(selected);

  if (selected >= 4) {
    window.location.href = REDDIT_URL;
  } else {
    new App().init();
  }
}

bootstrap();

// Sidebar tab switching functionality
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.sidebar-tab');
  const panels = document.querySelectorAll('.sidebar-panel');
  const STORAGE_KEY = 'arc-raiders-sidebar-tab';

  // Helper to activate a tab
  const activateTab = (tabName: string) => {
    tabs.forEach(t => {
      t.classList.toggle('active', (t as HTMLElement).dataset.tab === tabName);
    });
    panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${tabName}`);
    });
  };

  // Load saved tab or default to 'hideout'
  const savedTab = localStorage.getItem(STORAGE_KEY) || 'hideout';
  activateTab(savedTab);

  // Tab click handlers
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = (tab as HTMLElement).dataset.tab;
      if (targetTab) {
        activateTab(targetTab);
        localStorage.setItem(STORAGE_KEY, targetTab);
      }
    });
  });
});
