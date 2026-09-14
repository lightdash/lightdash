import fs from 'fs';
import path from 'path';

/**
 * `dist/esm` is a bundler-only build: tsc emits extensionless relative
 * specifiers and bare JSON imports, so Node's ESM loader cannot read it.
 * Node must land on `dist/cjs` through both `import` and `require`; bundlers
 * pick up `dist/esm` via the `module` condition, which Node ignores.
 */
type ExportTarget = string | string[] | Record<string, string>;

const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
) as { exports: Record<string, ExportTarget> };

const conditionalEntries = Object.entries(packageJson.exports).filter(
    (entry): entry is [string, Record<string, string>] =>
        typeof entry[1] === 'object' && !Array.isArray(entry[1]),
);

describe('@lightdash/common exports map', () => {
    it('covers the entry points the workspace imports', () => {
        expect(Object.keys(packageJson.exports)).toEqual([
            '.',
            './dbt/validation',
            './lightdash/loader',
            './src',
            './src/*',
            './dist/*',
            './package.json',
        ]);
    });

    it.each(conditionalEntries)(
        'sends Node to dist/cjs for "%s"',
        (_, conditions) => {
            expect(conditions.require).toMatch(/^\.\/dist\/cjs\//);
            expect(conditions.import).toMatch(/^\.\/dist\/cjs\//);
            expect(conditions.default).toMatch(/^\.\/dist\/cjs\//);
        },
    );

    it.each(conditionalEntries)(
        'sends bundlers to dist/esm for "%s"',
        (_, conditions) => {
            expect(conditions.module).toMatch(/^\.\/dist\/esm\//);
            expect(conditions.types).toMatch(/^\.\/dist\/esm\/.*\.d\.ts$/);
        },
    );

    it.each(conditionalEntries)(
        'matches "module" before "import" for "%s"',
        (_, conditions) => {
            const order = Object.keys(conditions);
            expect(order.indexOf('module')).toBeLessThan(
                order.indexOf('import'),
            );
        },
    );

    // Callers write `@lightdash/common/src/pivot/pivotQueryResults`; without the
    // extension candidates the map resolves to a path that has no file.
    it('resolves extensionless source subpaths', () => {
        expect(packageJson.exports['./src/*']).toEqual([
            './src/*.ts',
            './src/*.tsx',
            './src/*',
        ]);
    });
});
