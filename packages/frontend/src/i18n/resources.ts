import { type Resource, type ResourceKey } from 'i18next';

// Vite resolves this glob at build time; the SDK's rollup build shims it with
// the same shape (see `i18nGlob` in rollup.config.mjs).
const localeModules = import.meta.glob<ResourceKey>('./locales/*/*.json', {
    eager: true,
    import: 'default',
});

const LOCALE_PATH = /\/locales\/([^/]+)\/([^/]+)\.json$/;

export const resources: Resource = {};
for (const [path, translations] of Object.entries(localeModules)) {
    const match = LOCALE_PATH.exec(path);
    if (!match) continue;
    const [, language, namespace] = match;
    resources[language] = { ...resources[language], [namespace]: translations };
}

export const defaultNS = 'common';
export const fallbackLanguage = 'en';
export const supportedLanguages = Object.keys(resources).sort();
export const namespaces = Object.keys(resources[fallbackLanguage] ?? {});
