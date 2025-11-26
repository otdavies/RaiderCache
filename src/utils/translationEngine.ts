import { dataLoader } from "./dataLoader";

const STORAGE_KEY = 'language';

/**
 * Interface for translation data structure
 */
export interface TranslationData {
    [key: string]: Record<string, string | Array<string>>;
}

/**
 * Supported languages for translations
 */
export const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'es', 'pt', 'ja', 'zh-CN', 'ru'];
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * Singleton class for managing translations throughout the application
 */
export class TranslationEngine {
    private static instance: TranslationEngine | null = null;
    private dataCache: TranslationData | null = null;
    private initializationPromise: Promise<void> | null = null;
    private currentLanguage: SupportedLanguage = DEFAULT_LANGUAGE;
    /**
     * Private constructor to prevent direct construction calls with the `new` operator.
     */
    private constructor() {
        const languageInStorage = localStorage.getItem(STORAGE_KEY);
        if(!languageInStorage || !SUPPORTED_LANGUAGES.includes(languageInStorage)){
            this.currentLanguage = DEFAULT_LANGUAGE;
            localStorage.setItem(STORAGE_KEY, DEFAULT_LANGUAGE);
        }else{
            this.currentLanguage = languageInStorage as SupportedLanguage;
        }
    }

    /**
     * Gets the singleton instance of TranslationEngine.
     * Initializes the instance if it doesn't exist.
     * @returns Promise that resolves with the TranslationEngine instance
     */
    public static async getInstance(): Promise<TranslationEngine> {
        if (!TranslationEngine.instance) {
            TranslationEngine.instance = new TranslationEngine();
            await TranslationEngine.instance.initialize();
        } else if (TranslationEngine.instance.initializationPromise) {
            // If initialization is in progress, wait for it to complete
            await TranslationEngine.instance.initializationPromise;
        }
        return TranslationEngine.instance;
    }

    /**
     * Initializes the translation engine by loading translations
     */
    private async initialize(): Promise<void> {
        // Store the promise to handle concurrent initialization
        this.initializationPromise = this.loadTranslations();
        await this.initializationPromise;
        this.initializationPromise = null;
    }

    /**
     * Loads translations using the dataLoader
     */
    private async loadTranslations(): Promise<void> {
        try {
            this.dataCache = await dataLoader.loadTranslations();
        } catch (error) {
            console.error('Failed to load translations:', error);
            throw error;
        }
    }

    /**
     * Gets a translation for the given key and language
     * @param key The translation key
     * @param lang The language code (default: 'en')
     * @returns The translated string or the key if not found
     */
    public getTranslation<T = string>(key: string, params?: Array<string>): T {
        const formatKey = key.toLowerCase();
        if (!this.dataCache) {
            console.warn('Translations not loaded yet');
            return formatKey as T;
        }

        const translations = this.dataCache[key];
        if (!translations) {
            console.warn(`No translations found for key: ${key}`);
            return formatKey as T;
        }

        const translation = translations[this.currentLanguage] || translations[DEFAULT_LANGUAGE] || formatKey;
        if(params){
            const replacerFunc = (match: string) => {
                const result = params[Number(match.slice(1, -1))] || match
                return result;
            }
            if(Array.isArray(translation)){
                return translation.map((t) => t.replace(/{\d+}/g, replacerFunc)) as T;
            }
            return translation.replace(/{\d+}/g, replacerFunc) as T;
        }
        return translation as T;
    }

    /**
     * Gets all translations
     * @returns The complete translation data or null if not loaded
     */
    public getTranslations(): TranslationData | null {
        return this.dataCache;
    }

    /**
     * Sets the current language and saves it to localStorage
     * @param lang Language code (e.g., 'en', 'fr')
     */
    public setLanguage(lang: SupportedLanguage): void {
        if (!SUPPORTED_LANGUAGES.includes(lang)) {
            console.warn(`Unsupported language: ${lang}`);
            return;
        }
        if (this.currentLanguage !== lang) {
            this.currentLanguage = lang;
            localStorage.setItem(STORAGE_KEY, lang);
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
        }
    }

    /**
     * Gets the current language
     */
    public getCurrentLanguage(): string {
        return this.currentLanguage;
    }
}

// Global instance
let _translationEngine: TranslationEngine | null = null;

/**
 * Initializes the global translation engine
 * @returns Promise that resolves when the translation engine is ready
 */
export async function initializeTranslationEngine(): Promise<void> {
    if (!_translationEngine) {
        _translationEngine = await TranslationEngine.getInstance();
    }
}

// exporting instance
export const translationEngine = {
    getInstance: (): TranslationEngine => {
        if (!_translationEngine) {
            throw new Error('TranslationEngine not initialized. Call initializeTranslationEngine() first.');
        }
        return _translationEngine;
    },
    get: <T = string>(key: string, params?: Array<string>): T => {
        if (!_translationEngine) {
            console.warn('TranslationEngine not initialized');
            return key as T;
        }
        return _translationEngine.getTranslation<T>(key, params);
    },
    setLanguage: (lang: SupportedLanguage) => {
        if (!_translationEngine) {
            console.warn('TranslationEngine not initialized');
            return;
        }
        _translationEngine.setLanguage(lang);
    },
    getCurrentLanguage: () => {
        if (!_translationEngine) {
            console.warn('TranslationEngine not initialized');
            return DEFAULT_LANGUAGE;
        }
        return _translationEngine.getCurrentLanguage() || DEFAULT_LANGUAGE;
    }
};

//Adding the engine on the window to be accessed in html
declare global {
    interface Window {
        translationEngine: typeof translationEngine;
    }
}
if (typeof window !== 'undefined') {
    window.translationEngine = translationEngine;
}
