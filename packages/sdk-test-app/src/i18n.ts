import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Locize from 'i18next-locize-backend';
import { initReactI18next } from 'react-i18next';

i18next
    .use(Locize)
    .use(LanguageDetector)
    .use(initReactI18next) // bind react-i18next to the instance
    .init({
        backend: {
            // TODO: set these
            projectId: '46d373ca-fa6c-4f26-b5e8-6d365b336b1a',
            apiKey: '31ba4e7b-e170-4c55-b5dd-dcb55413664f',
            version: 'latest',
            private: false,
            referenceLng: 'en',
        },

        defaultNS: 'sdk-test-app',
        ns: ['sdk-test-app', 'lightdash', 'analytics'],
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
