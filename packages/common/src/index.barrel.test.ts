import fs from 'fs';
import path from 'path';

/**
 * Guards the barrel's eager payload (#28697): `dbt/validation.ts` imports ~3.6 MB
 * of dbt JSON schemas at module top level, and re-exporting it from `index.ts`
 * made every frontend page — the signed-out login page included — load them.
 * Only the backend and CLI validate manifests, via `@lightdash/common/dbt/validation`.
 */
const SRC = __dirname;
const EXTENSIONS = ['.ts', '.tsx', '.json', '/index.ts', '/index.tsx'];

const resolveSpecifier = (
    fromFile: string,
    specifier: string,
): string | null => {
    const base = path.resolve(path.dirname(fromFile), specifier);
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    for (const ext of EXTENSIONS) {
        const candidate = `${base}${ext}`;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }
    return null;
};

// Static `import ... from '...'`, `export ... from '...'` and bare `import '...'`.
// Type-only forms are elided by the compiler, so they cost nothing at runtime.
const STATIC_SPECIFIER =
    /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?['"](\.[^'"]*)['"]/g;

const collectReachableModules = (entry: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (!seen.has(file)) {
            seen.add(file);
            if (!file.endsWith('.json')) {
                const source = fs.readFileSync(file, 'utf8');
                for (const match of source.matchAll(STATIC_SPECIFIER)) {
                    const resolved = resolveSpecifier(file, match[1]!);
                    if (resolved !== null) queue.push(resolved);
                }
            }
        }
    }
    return seen;
};

describe('@lightdash/common barrel eager payload (#28697)', () => {
    const reachable = collectReachableModules(path.join(SRC, 'index.ts'));
    const reachableJson = [...reachable].filter((f) => f.endsWith('.json'));

    it('does not reach the dbt manifest schemas', () => {
        const dbtSchemas = reachableJson
            .filter((f) =>
                f.includes(`${path.sep}dbt${path.sep}schemas${path.sep}`),
            )
            .map((f) => path.relative(SRC, f));

        expect(dbtSchemas).toEqual([]);
    });

    it('does not reach dbt/validation', () => {
        expect(reachable).not.toContain(path.join(SRC, 'dbt', 'validation.ts'));
    });

    it('keeps the eagerly imported JSON under budget', () => {
        const totalBytes = reachableJson.reduce(
            (total, file) => total + fs.statSync(file).size,
            0,
        );

        expect(totalBytes).toBeLessThan(512 * 1024);
    });
});
