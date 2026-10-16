import { type Resource, type ResourceKey } from 'i18next';

export type LocaleLoader = () => Promise<ResourceKey>;

// Vite resolves these globs at build time; the SDK's rollup build shims them
// (see `i18nGlob` in rollup.config.mjs). English is bundled so the first render
// is never blank; every other language is a lazy chunk loaded on demand.
// Node scripts (tsx) have no Vite runtime, so they get empty maps.
const hasGlob = import.meta.env !== undefined;
const eagerModules: Record<string, ResourceKey> = hasGlob
    ? import.meta.glob<ResourceKey>('./locales/en/*.json', {
          eager: true,
          import: 'default',
      })
    : {};
const lazyModules: Record<string, LocaleLoader> = hasGlob
    ? import.meta.glob<ResourceKey>('./locales/!(en)/*.json', {
          import: 'default',
      })
    : {};

const LOCALE_PATH = /\/locales\/([^/]+)\/([^/]+)\.json$/;

const parseLocalePath = (path: string) => {
    const match = LOCALE_PATH.exec(path);
    return match ? { language: match[1], namespace: match[2] } : null;
};

export const resources: Resource = {};
for (const [path, translations] of Object.entries(eagerModules)) {
    const parsed = parseLocalePath(path);
    if (!parsed) continue;
    resources[parsed.language] = {
        ...resources[parsed.language],
        [parsed.namespace]: translations,
    };
}

export const getLocaleLoader = (
    language: string,
    namespace: string,
): LocaleLoader | null =>
    lazyModules[`./locales/${language}/${namespace}.json`] ?? null;

export const defaultNS = 'common';
export const fallbackLanguage = 'en';
export const supportedLanguages = [
    ...new Set(
        [...Object.keys(eagerModules), ...Object.keys(lazyModules)]
            .map(parseLocalePath)
            .flatMap((parsed) => (parsed ? [parsed.language] : [])),
    ),
].sort();
export const namespaces = Object.keys(resources[fallbackLanguage] ?? {});
