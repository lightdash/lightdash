import {
    findUnexpectedZodLocaleModules,
    isZodLocaleBarrelModule,
} from './vite.config.zodLocales';

describe('isZodLocaleBarrelModule', () => {
    it('matches the resolved Zod locale barrel module', () => {
        expect(
            isZodLocaleBarrelModule(
                '/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/locales/index.js',
            ),
        ).toBe(true);
    });

    it('does not replace individual locale modules', () => {
        expect(
            isZodLocaleBarrelModule(
                '/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/locales/en.js',
            ),
        ).toBe(false);
    });
});

describe('findUnexpectedZodLocaleModules', () => {
    it('allows only the directly imported English locale', () => {
        expect(
            findUnexpectedZodLocaleModules([
                '/node_modules/zod/v4/locales/index.js',
                '/node_modules/zod/v4/locales/en.js',
                '/node_modules/zod/v4/core/core.js',
            ]),
        ).toEqual([]);
    });

    it('detects non-English locales', () => {
        expect(
            findUnexpectedZodLocaleModules([
                '/node_modules/zod/v4/locales/index.js',
                '/node_modules/zod/v4/locales/de.js',
                '/node_modules/zod/v4/locales/en.js',
            ]),
        ).toEqual(['/node_modules/zod/v4/locales/de.js']);
    });
});
