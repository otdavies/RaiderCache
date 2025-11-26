import { translationEngine } from './translationEngine';

function updateTranslations() {
    // Update standard texts (data-i18n)
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (key) {
            element.textContent = translationEngine.get(key);
        }
    });

    // Update dynamic custom attributes (data-i18n-*)
    const elements = Array.from(document.getElementsByTagName('*')).filter(el =>
        Array.from(el.attributes).some(attr => attr.name.startsWith('data-i18n-'))
    ) as HTMLElement[];

    elements.forEach(element => {
        Array.from(element.attributes).forEach(attr => {
            if (attr.name.startsWith('data-i18n-') && attr.name !== 'data-i18n') {
                const attributeName = attr.name.replace('data-i18n-', '');
                const translationKey = attr.value;

                if (translationKey) {
                    const translation = translationEngine.get(translationKey);
                    element.setAttribute(attributeName, translation);
                }
            }
        });
    });
}

export { updateTranslations as updateAllTranslations };

export function initializeI18n() {
    window.addEventListener('languageChanged', updateTranslations);
    updateTranslations();
}
