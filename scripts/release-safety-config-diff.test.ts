import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    diffConfigBetweenRefs,
    diffConfigSurfaces,
    extractConfigSurface,
} from './release-safety-config-diff';

let passed = 0;
const failures: string[] = [];

function test(name: string, run: () => void): void {
    try {
        run();
        passed += 1;
    } catch (error: unknown) {
        failures.push(
            `${name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
        );
    }
}

test('extracts dot, bracket, and environment helper references', () => {
    const surface = extractConfigSurface({
        'config.ts': `
            const first = process.env.DOT_NAME;
            const second = process.env["BRACKET_NAME"];
            const third = getIntegerFromEnvironmentVariable('HELPER_NAME');
            const ignored = process.env.dynamicName;
            const alsoIgnored = getIntegerFromEnvironmentVariable(variableName);
        `,
    });

    assert.deepStrictEqual(Object.keys(surface), [
        'BRACKET_NAME',
        'DOT_NAME',
        'HELPER_NAME',
    ]);
});

test('captures literal nullish and logical defaults', () => {
    const surface = extractConfigSurface({
        'config.ts': `
            const a = process.env.STRING_DEFAULT ?? 'fallback';
            const b = process.env.NUMBER_DEFAULT || 42;
            const c = getIntegerFromEnvironmentVariable('NEGATIVE_DEFAULT') ?? -5;
            const d = process.env.NO_LITERAL_DEFAULT ?? computedDefault;
        `,
    });

    assert.strictEqual(surface.STRING_DEFAULT.defaultValue, 'fallback');
    assert.strictEqual(surface.NUMBER_DEFAULT.defaultValue, '42');
    assert.strictEqual(surface.NEGATIVE_DEFAULT.defaultValue, '-5');
    assert.strictEqual(surface.NO_LITERAL_DEFAULT.defaultValue, null);
});

test('reports no changes for equivalent surfaces', () => {
    const surface = extractConfigSurface({
        'config.ts': `const value = process.env.STABLE ?? 'same';`,
    });
    assert.deepStrictEqual(diffConfigSurfaces(surface, surface), {
        checked: true,
        breaking: false,
        changes: [],
    });
});

test('reports removed configuration with its previous default', () => {
    const before = extractConfigSurface({
        'config.ts': `
            const keep = process.env.KEEP;
            const removed = process.env.REMOVED ?? 'old';
        `,
    });
    const after = extractConfigSurface({
        'config.ts': `const keep = process.env.KEEP;`,
    });

    assert.deepStrictEqual(diffConfigSurfaces(before, after).changes, [
        {
            type: 'removed',
            name: 'REMOVED',
            previousDefault: 'old',
        },
    ]);
});

test('detects a unique structural rename even when its default changes', () => {
    const before = extractConfigSurface({
        'config.ts': `const timeout = getIntegerFromEnvironmentVariable('OLD_TIMEOUT') ?? 10;`,
    });
    const after = extractConfigSurface({
        'config.ts': `const timeout = getIntegerFromEnvironmentVariable('NEW_TIMEOUT') ?? 20;`,
    });

    assert.deepStrictEqual(diffConfigSurfaces(before, after).changes, [
        {
            type: 'renamed',
            name: 'NEW_TIMEOUT',
            previousName: 'OLD_TIMEOUT',
            defaultValue: '20',
        },
    ]);
});

test('ambiguous signatures remain removals', () => {
    const before = extractConfigSurface({
        'config.ts': `
            const values = [process.env.OLD_FIRST, process.env.OLD_SECOND];
        `,
    });
    const after = extractConfigSurface({
        'config.ts': `
            const values = [process.env.NEW_FIRST, process.env.NEW_SECOND];
        `,
    });

    assert.deepStrictEqual(diffConfigSurfaces(before, after).changes, [
        { type: 'removed', name: 'OLD_FIRST', previousDefault: null },
        { type: 'removed', name: 'OLD_SECOND', previousDefault: null },
    ]);
});

test('reports same-name literal default changes', () => {
    const before = extractConfigSurface({
        'config.ts': `const retries = process.env.RETRIES ?? '3';`,
    });
    const after = extractConfigSurface({
        'config.ts': `const retries = process.env.RETRIES ?? '5';`,
    });

    assert.deepStrictEqual(diffConfigSurfaces(before, after).changes, [
        {
            type: 'defaultChanged',
            name: 'RETRIES',
            previousDefault: '3',
            defaultValue: '5',
        },
    ]);
});

test('surface output is deterministic across input file ordering', () => {
    const first = extractConfigSurface({
        'z.ts': `const z = process.env.ZED;`,
        'a.ts': `const a = process.env.ALPHA ?? true;`,
    });
    const second = extractConfigSurface({
        'a.ts': `const a = process.env.ALPHA ?? true;`,
        'z.ts': `const z = process.env.ZED;`,
    });
    assert.deepStrictEqual(first, second);
});

test('syntax degradation throws from the pure extractor', () => {
    assert.throws(() =>
        extractConfigSurface({ 'broken.ts': `const value = ;` }),
    );
});

test('invalid git refs degrade to an unknown unchecked surface', () => {
    const messages: string[] = [];
    const result = diffConfigBetweenRefs({
        fromRef: 'ref-that-does-not-exist-for-release-safety-test',
        toRef: 'HEAD',
        log: (message) => messages.push(message),
    });
    assert.deepStrictEqual(result, {
        checked: false,
        breaking: 'unknown',
        changes: [],
    });
    assert.strictEqual(messages.length, 1);
});

test('identical git refs are checked through the complete IO path', () => {
    assert.deepStrictEqual(
        diffConfigBetweenRefs({ fromRef: 'HEAD', toRef: 'HEAD' }),
        { checked: true, breaking: false, changes: [] },
    );
});

test('loads and runs without repository dependency resolution', () => {
    const directory = mkdtempSync(join(tmpdir(), 'release-safety-config-'));
    try {
        copyFileSync(
            join(process.cwd(), 'scripts/release-safety-config-diff.ts'),
            join(directory, 'analyzer.ts'),
        );
        writeFileSync(
            join(directory, 'run.ts'),
            `
                import { extractConfigSurface } from './analyzer';
                const surface = extractConfigSurface({
                    'config.ts': "const value = process.env.ISOLATED ?? 'yes';",
                });
                process.stdout.write(JSON.stringify(surface));
            `,
        );

        const output = execFileSync(
            process.execPath,
            [...process.execArgv, join(directory, 'run.ts')],
            {
                cwd: directory,
                encoding: 'utf8',
                env: { ...process.env, NODE_PATH: '' },
            },
        );
        const surface = JSON.parse(output) as Record<
            string,
            { defaultValue: string | null; usageSignature: string }
        >;
        assert.strictEqual(surface.ISOLATED.defaultValue, 'yes');
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

if (failures.length > 0) {
    console.error(`${failures.length} failed, ${passed} passed`);
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

console.log(`${passed} tests passed`);
