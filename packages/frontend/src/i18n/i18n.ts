import i18next, { type BackendModule } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import {
    defaultNS,
    fallbackLanguage,
    getLocaleLoader,
    namespaces,
    resources,
    supportedLanguages,
} from './resources';

export const LANGUAGE_STORAGE_KEY = 'lightdash.language';

// Loads non-English namespaces on demand; English is bundled in `resources`.
const lazyLocaleBackend: BackendModule = {
    type: 'backend',
    init: () => {},
    read: (language, namespace, callback) => {
        const load = getLocaleLoader(language, namespace);
        if (!load) {
            callback(null, {});
            return;
        }
        load().then(
            (translations) => callback(null, translations),
            (error: unknown) => callback(error as Error, null),
        );
    },
};

void i18next
    .use(LanguageDetector)
    .use(lazyLocaleBackend)
    .use(initReactI18next)
    .init({
        resources,
        partialBundledLanguages: true,
        // Bundled English initialises synchronously so first render has strings.
        initAsync: false,
        fallbackLng: fallbackLanguage,
        supportedLngs: supportedLanguages,
        nonExplicitSupportedLngs: true,
        load: 'languageOnly',
        defaultNS,
        ns: namespaces,
        returnNull: false,
        interpolation: { escapeValue: false },
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: LANGUAGE_STORAGE_KEY,
            caches: ['localStorage'],
        },
        react: {
            // English renders immediately; components re-render when a lazy
            // language finishes loading instead of suspending.
            useSuspense: false,
            bindI18n: 'initialized languageChanged loaded',
            bindI18nStore: 'added',
        },
    });

export default i18next;
