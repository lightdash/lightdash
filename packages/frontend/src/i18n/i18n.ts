import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import {
    defaultNS,
    fallbackLanguage,
    namespaces,
    resources,
    supportedLanguages,
} from './resources';

export const LANGUAGE_STORAGE_KEY = 'lightdash.language';

void i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
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
    });

export default i18next;
