import { type OutputBundle, type Plugin } from 'vite';

const ZOD_LOCALE_BARREL_MODULE_PATTERN =
    /[/\\]zod[/\\]v4[/\\]locales[/\\]index\.[cm]?[jt]s(?:\?.*)?$/;
const ZOD_LOCALE_MODULE_PATTERN =
    /[/\\]zod[/\\]v4[/\\]locales[/\\]([^/\\]+)\.[cm]?[jt]s(?:\?.*)?$/;
const ENGLISH_ONLY_LOCALES_MODULE = 'export { default as en } from "./en.js";';

export const isZodLocaleBarrelModule = (moduleId: string): boolean =>
    ZOD_LOCALE_BARREL_MODULE_PATTERN.test(moduleId);

export const findUnexpectedZodLocaleModules = (moduleIds: string[]): string[] =>
    moduleIds.filter((moduleId) => {
        const locale = ZOD_LOCALE_MODULE_PATTERN.exec(moduleId)?.[1];
        return locale !== undefined && locale !== 'en' && locale !== 'index';
    });

const getBundleModuleIds = (bundle: OutputBundle): string[] =>
    Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' ? Object.keys(output.modules) : [],
    );

/**
 * Zod's `z` namespace re-exports every locale. Rolldown must preserve those
 * namespace properties, so all locale modules otherwise enter the initial
 * frontend chunk even though Lightdash only uses the default English locale.
 */
export const pruneZodLocalesPlugin = (): Plugin => ({
    name: 'lightdash-prune-zod-locales',
    enforce: 'pre',
    load(moduleId) {
        return isZodLocaleBarrelModule(moduleId)
            ? ENGLISH_ONLY_LOCALES_MODULE
            : null;
    },
    generateBundle(_options, bundle) {
        const unexpectedLocales = findUnexpectedZodLocaleModules(
            getBundleModuleIds(bundle),
        );

        if (unexpectedLocales.length > 0) {
            this.error(
                `Unexpected Zod locales in frontend bundle:\n${unexpectedLocales.join(
                    '\n',
                )}`,
            );
        }
    },
});
