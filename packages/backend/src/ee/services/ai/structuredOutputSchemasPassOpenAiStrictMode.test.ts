import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildAppMetadataSchema } from '../AppGenerateService/AppGenerateService';
import { assertStrictModeSafe } from './utils/strictOutput';

// strictOutput only checks a schema when a call runs, and some calls never run
// in tests. This checks the schema of every strictOutput call site up front.

const PACKAGES = path.resolve(__dirname, '../../../../..');
// The backend and the common code it runs.
const SOURCE_ROOTS = ['backend/src', 'common/src'];

// Schemas built per call: every variant the call site can build.
const BUILT_SCHEMAS = new Map([
    [
        'backend/src/ee/services/AppGenerateService/AppGenerateService.ts metadataSchema',
        [buildAppMetadataSchema(true), buildAppMetadataSchema(false)],
    ],
]);

const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
const STRICT_OUTPUT = /\bstrictOutput\(/g;
const SCHEMA_ARGUMENT = /^strictOutput\(\s*([A-Za-z_$][\w$]*)\s*,?\s*\)/;
const NAMED_IMPORTS =
    /^import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*'([^']+)';/gm;

const listFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules') return [];
        const entryPath = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    });

const sources = SOURCE_ROOTS.flatMap((root) =>
    listFiles(path.join(PACKAGES, root)),
)
    .map((filePath) => path.relative(PACKAGES, filePath))
    .filter(
        (file) =>
            SOURCE_FILE.test(file) &&
            !TEST_FILE.test(file) &&
            // Diagnostic CLIs that run on import, not product call sites.
            !file.startsWith('backend/src/scripts/'),
    )
    .map((file) => ({
        file,
        source: readFileSync(path.join(PACKAGES, file), 'utf8'),
    }));

const lineAt = (source: string, index: number) =>
    source.slice(0, index).split('\n').length;

const sites = sources.flatMap(({ file, source }) =>
    [...source.matchAll(STRICT_OUTPUT)].map((match) => ({
        file,
        source,
        line: lineAt(source, match.index),
        schema: SCHEMA_ARGUMENT.exec(source.slice(match.index))?.[1] ?? null,
    })),
);

/** `import { a as b } from './x'` maps local b to export a of ./x. */
const namedImports = (file: string, source: string) =>
    [...source.matchAll(NAMED_IMPORTS)].flatMap(([, specifiers, from]) =>
        specifiers
            .split(',')
            .map((specifier) => specifier.trim())
            .filter(
                (specifier) =>
                    specifier !== '' && !specifier.startsWith('type '),
            )
            .map((specifier) => {
                const [imported, local = imported] =
                    specifier.split(/\s+as\s+/);
                return {
                    local,
                    imported,
                    module: from.startsWith('.')
                        ? path.resolve(PACKAGES, path.dirname(file), from)
                        : from,
                };
            }),
    );

const importExport = async (module: string, name: string) => {
    const moduleExports: unknown = await import(/* @vite-ignore */ module);
    return typeof moduleExports === 'object' &&
        moduleExports !== null &&
        name in moduleExports
        ? Reflect.get(moduleExports, name)
        : null;
};

/** Every schema the call site can pass; throws with the fix when it cannot tell. */
const resolveSchemas = async ({
    file,
    source,
    line,
    schema,
}: (typeof sites)[number]) => {
    if (schema === null) {
        throw new Error(
            `${file}:${line}: cannot read the schema passed to strictOutput. Write it as strictOutput(<name>) with a module-level exported schema so this test can check it.`,
        );
    }
    const built = BUILT_SCHEMAS.get(`${file} ${schema}`);
    if (built) return built;
    const imported = namedImports(file, source).find(
        (entry) => entry.local === schema,
    );
    const value: unknown = imported
        ? await importExport(imported.module, imported.imported)
        : await importExport(path.join(PACKAGES, file), schema);
    if (!(value instanceof z.ZodType)) {
        throw new Error(
            `${file}:${line}: ${schema} is not a zod schema this test can import. Export it as a module-level const or, if it is built per call, list every variant in BUILT_SCHEMAS.`,
        );
    }
    return [value];
};

describe('structured output schemas pass OpenAI strict mode', () => {
    it('finds the strictOutput call sites', () => {
        expect(sites.length).toBeGreaterThan(0);
    });

    it('lists no built schema that no call site uses', () => {
        const used = new Set(
            sites.map(({ file, schema }) => `${file} ${schema}`),
        );
        expect(
            [...BUILT_SCHEMAS.keys()].filter((key) => !used.has(key)),
        ).toEqual([]);
    });

    sites.forEach((site) => {
        it(`${site.file}:${site.line} ${site.schema} passes OpenAI strict mode`, async () => {
            const schemas = await resolveSchemas(site);
            schemas.forEach((schema) => assertStrictModeSafe(schema));
        });
    });
});
