import Ajv from 'ajv';
import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    collectBreakingChangeDeclarationsBetweenRefs,
    diffBreakingChangeDeclarations,
} from './release-safety-declarations';

let passed = 0;
const failures: string[] = [];

function test(name: string, run: () => void): void {
    try {
        run();
        passed += 1;
    } catch (error) {
        failures.push(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

const registry = (
    declarations: Record<string, Record<string, unknown>>,
): string => JSON.stringify({ declarations });

const first = {
    reason: 'Existing API clients still use the removed request field.',
    requiredStop: false,
};

test('an ID added in a range is active', () => {
    const result = diffBreakingChangeDeclarations(
        registry({}),
        registry({ 'remove-request-field': first }),
    );
    assert.deepStrictEqual(result.diagnostics, []);
    assert.deepStrictEqual(result.added, [
        { id: 'remove-request-field', ...first },
    ]);
});

test('a stale declaration is not collected by a later range', () => {
    const source = registry({ 'remove-request-field': first });
    assert.deepStrictEqual(diffBreakingChangeDeclarations(source, source), {
        added: [],
        diagnostics: [],
    });
});

test('a stacked PR does not collect an entry already present at its base', () => {
    const base = registry({ 'remove-request-field': first });
    const target = registry({
        'remove-request-field': first,
        'second-break': {
            reason: 'Older workers cannot read the new job payload.',
            requiredStop: true,
        },
    });
    assert.deepStrictEqual(
        diffBreakingChangeDeclarations(base, target).added.map(({ id }) => id),
        ['second-break'],
    );
});

test('editing a reason is an append-only violation and does not reactivate it', () => {
    const result = diffBreakingChangeDeclarations(
        registry({ 'remove-request-field': first }),
        registry({
            'remove-request-field': {
                ...first,
                reason: 'Changed reason text must use another ID.',
            },
        }),
    );
    assert.deepStrictEqual(result.added, []);
    assert.ok(
        result.diagnostics.some(({ message }) => message.includes('changed')),
    );
});

test('renaming an ID fails as removal and duplicate content', () => {
    const result = diffBreakingChangeDeclarations(
        registry({ 'remove-request-field': first }),
        registry({ 'renamed-request-field': first }),
    );
    assert.deepStrictEqual(result.added, []);
    assert.ok(
        result.diagnostics.some(({ message }) => message.includes('removed')),
    );
    assert.ok(
        result.diagnostics.some(({ message }) =>
            message.includes('duplicates'),
        ),
    );
});

test('adding duplicate content from the base ref is rejected', () => {
    const result = diffBreakingChangeDeclarations(
        registry({ 'remove-request-field': first }),
        registry({
            'remove-request-field': first,
            'duplicate-request-field': first,
        }),
    );
    assert.deepStrictEqual(result.added, []);
    assert.ok(
        result.diagnostics.some(({ message }) =>
            message.includes('duplicates'),
        ),
    );
});

test('deleting an entry fails closed', () => {
    const result = diffBreakingChangeDeclarations(
        registry({ 'remove-request-field': first }),
        registry({}),
    );
    assert.deepStrictEqual(result.added, []);
    assert.ok(
        result.diagnostics.some(({ message }) => message.includes('removed')),
    );
});

test('a release documentation stamp does not reactivate an ID', () => {
    const result = diffBreakingChangeDeclarations(
        registry({ 'remove-request-field': first }),
        registry({
            'remove-request-field': { ...first, releasedIn: '1.198.0' },
        }),
    );
    assert.deepStrictEqual(result, { added: [], diagnostics: [] });
});

test('an existing release documentation stamp is immutable', () => {
    const result = diffBreakingChangeDeclarations(
        registry({
            'remove-request-field': { ...first, releasedIn: '1.198.0' },
        }),
        registry({
            'remove-request-field': { ...first, releasedIn: '1.199.0' },
        }),
    );
    assert.deepStrictEqual(result.added, []);
    assert.ok(
        result.diagnostics.some(({ message }) => message.includes('changed')),
    );
});

test('migration entries retain their migration path', () => {
    const migration =
        'packages/backend/src/database/migrations/20260819000000_break.ts';
    const result = diffBreakingChangeDeclarations(
        registry({}),
        registry({
            'migration-break': {
                ...first,
                migration,
            },
        }),
    );
    assert.strictEqual(result.added[0]?.migration, migration);
});

test('the committed registry matches its schema', () => {
    const schema = JSON.parse(
        readFileSync(
            join(__dirname, 'release-safety-declarations.schema.json'),
            'utf8',
        ),
    ) as Record<string, unknown>;
    const value = JSON.parse(
        readFileSync(
            join(__dirname, '..', 'release-safety.declarations.json'),
            'utf8',
        ),
    );
    const validate = new Ajv({ strict: false }).compile(schema);
    assert.strictEqual(validate(value), true, JSON.stringify(validate.errors));
});

test('release and PR endpoint ranges activate the same ID after a squash', () => {
    const directory = mkdtempSync(
        join(tmpdir(), 'release-safety-declarations-'),
    );
    const previousCwd = process.cwd();
    try {
        execFileSync('git', ['init', '--quiet'], { cwd: directory });
        execFileSync('git', ['config', 'user.email', 'test@lightdash.com'], {
            cwd: directory,
        });
        execFileSync('git', ['config', 'user.name', 'Release Safety Test'], {
            cwd: directory,
        });
        const file = join(directory, 'release-safety.declarations.json');
        writeFileSync(file, registry({}));
        execFileSync('git', ['add', 'release-safety.declarations.json'], {
            cwd: directory,
        });
        execFileSync('git', ['commit', '--quiet', '-m', 'base'], {
            cwd: directory,
        });
        execFileSync('git', ['update-ref', 'refs/tags/last-release', 'HEAD'], {
            cwd: directory,
        });
        const mergeBase = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: directory,
            encoding: 'utf8',
        }).trim();
        writeFileSync(file, registry({ 'remove-request-field': first }));
        execFileSync('git', ['add', 'release-safety.declarations.json'], {
            cwd: directory,
        });
        execFileSync('git', ['commit', '--quiet', '-m', 'squashed change'], {
            cwd: directory,
        });
        process.chdir(directory);
        const releaseRange = collectBreakingChangeDeclarationsBetweenRefs(
            'last-release',
            'HEAD',
        );
        const prRange = collectBreakingChangeDeclarationsBetweenRefs(
            mergeBase,
            'HEAD',
        );
        assert.deepStrictEqual(releaseRange, prRange);
        assert.deepStrictEqual(
            releaseRange.added.map(({ id }) => id),
            ['remove-request-field'],
        );
    } finally {
        process.chdir(previousCwd);
        rmSync(directory, { recursive: true, force: true });
    }
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
