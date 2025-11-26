import '../styles/profile.css';
import type { Quest } from '../types/Quest';
import type { UserProgress } from '../types/UserProgress';
import { DEFAULT_LANGUAGE, translationEngine } from '../utils/translationEngine';

export interface ProfileModalConfig {
  quests: Quest[];
  userProgress: UserProgress;
  onSave: (progress: UserProgress) => void;
}

export class ProfileModal {
  private config: ProfileModalConfig;
  private workingProgress: UserProgress;

  constructor(config: ProfileModalConfig) {
    this.config = config;
    this.workingProgress = this.cloneProgress(config.userProgress);
  }

  show(): void {
    this.workingProgress = this.cloneProgress(this.config.userProgress);
    const modal = document.getElementById('profile-modal');
    const content = modal?.querySelector('.modal-content');
    if (!modal || !content) return;

    content.innerHTML = this.render();
    modal.classList.add('active');
    this.attachEvents(modal);
  }

  updateState(progress: UserProgress, quests: Quest[]): void {
    this.config.quests = quests;
    this.config.userProgress = this.cloneProgress(progress);
    this.workingProgress = this.cloneProgress(progress);
  }

  private attachEvents(modal: HTMLElement): void {
    const overlay = modal.querySelector('.modal-overlay');
    const closeBtn = modal.querySelector('[data-action="close"]');
    const saveBtn = modal.querySelector('[data-action="save"]');

    overlay?.addEventListener('click', () => this.hide());
    closeBtn?.addEventListener('click', () => this.hide());
    saveBtn?.addEventListener('click', () => this.saveAndClose());

    // Quest checkboxes
    const questToggles = modal.querySelectorAll<HTMLInputElement>('[data-quest-id]');
    questToggles.forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const questId = target.dataset.questId!;
        if (target.checked) {
          if (!this.workingProgress.completedQuests.includes(questId)) {
            this.workingProgress.completedQuests.push(questId);
          }
        } else {
          this.workingProgress.completedQuests = this.workingProgress.completedQuests.filter(id => id !== questId);
        }
      });
    });
  }

  private saveAndClose(): void {
    this.workingProgress.lastUpdated = Date.now();
    this.config.onSave(this.cloneProgress(this.workingProgress));
    this.hide();
  }

  private hide(): void {
    const modal = document.getElementById('profile-modal');
    modal?.classList.remove('active');
  }

  private getLocalizedName(name: string | Record<string, string> | undefined, lang: string, fallbackId: string): string {
    if (!name) return fallbackId;
    if (typeof name === 'string') return name;
    return name[lang] || name[DEFAULT_LANGUAGE] || fallbackId;
  }

  private render(): string {
    const lang = translationEngine.getCurrentLanguage() || DEFAULT_LANGUAGE;

    const questItems = this.config.quests.sort((a, b) => {
      const nameA = this.getLocalizedName(a.name, lang, a.id);
      const nameB = this.getLocalizedName(b.name, lang, b.id);
      return nameA.localeCompare(nameB);
    })
      .map(quest => {
        const questName = this.getLocalizedName(quest.name, lang, quest.id);
        const checked = this.workingProgress.completedQuests.includes(quest.id) ? 'checked' : '';
        return `
          <label class="profile-quest">
            <input type="checkbox" data-quest-id="${quest.id}" ${checked} />
            <span>${questName}</span>
          </label>
        `;
      })
      .join('');

    const completedCount = this.workingProgress.completedQuests.length;
    const totalCount = this.config.quests.length;

    return `
      <div class="profile-modal quests-modal">
        <div class="profile-modal__header">
          <div class="profile-modal__eyebrow">
            ${translationEngine.get('profile.quests.title')}
          </div>
          <p class="profile-modal__hint">${completedCount} / ${totalCount} completed</p>
        </div>
        <div class="profile-modal__body">
          <div class="profile-quests-list">
            ${questItems}
          </div>
        </div>
        <div class="profile-modal__footer">
          <button class="btn btn-ghost" data-action="close">${translationEngine.get('profile.close')}</button>
          <button class="btn btn-primary" data-action="save">${translationEngine.get('profile.save')}</button>
        </div>
      </div>
    `;
  }

  private cloneProgress(progress: UserProgress): UserProgress {
    return {
      hideoutLevels: { ...progress.hideoutLevels },
      completedQuests: [...progress.completedQuests],
      completedProjects: [...progress.completedProjects],
      lastUpdated: progress.lastUpdated
    };
  }
}
