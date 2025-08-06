import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

i18next
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next) // bind react-i18next to the instance
    .init({
        // Options for using Locize as the backend
        /*
        backend: {
            projectId: import.meta.env.VITE_LOCIZE_PROJECT_ID,
            apiKey: import.meta.env.VITE_LOCIZE_API_KEY,
            version: 'latest',
            private: false,
            referenceLng: 'en',
        },
        */
        fallbackLng: 'en',
        debug: true,

        // react i18next special options (optional)
        // override if needed - omit if ok with defaults
        /*
        react: {
          bindI18n: 'languageChanged',
          bindI18nStore: '',
          transEmptyNodeValue: '',
          transSupportBasicHtmlNodes: true,
          transKeepBasicHtmlNodesFor: ['br', 'strong', 'i'],
          useSuspense: true,
        }
        */
    });

export default i18next;
