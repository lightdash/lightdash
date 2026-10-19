import Ajv from 'ajv';
import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    uncoveredFindings,
    unmatchedCoverEntries,
    partitionDeclarations,
} from './release-safety-advisories';
import type { AdvisoryDeclaration } from './release-safety-declarations';
import {
    collectBreakingChangeDeclarationsBetweenRefs,
    diffBreakingChangeDeclarations,
    parseBreakingChangeDeclarationsFile,
    parseFeatureFlagValues,
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
        advisories: [],
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
    assert.deepStrictEqual(result, { added: [], advisories: [], diagnostics: [] });
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
        mkdirSync(join(directory, 'packages/common/src/types'), {
            recursive: true,
        });
        const flagsPath = join(
            directory,
            'packages/common/src/types/featureFlags.ts',
        );
        writeFileSync(
            flagsPath,
            "export enum FeatureFlags { AgentIdentity = 'agent-identity', }",
        );
        const flaggedEntry = {
            reason: 'The feature is off by default on Cloud and self-hosted.',
            requiredStop: false,
            impact: {
                kind: 'no-external-callers',
                featureFlag: 'agent-identity',
                covers: { rest: ['POST /x'], mcp: [] },
            },
        };
        writeFileSync(
            file,
            registry({ 'remove-request-field': first, internal: flaggedEntry }),
        );
        execFileSync('git', ['add', '.'], { cwd: directory });
        execFileSync(
            'git',
            ['commit', '--quiet', '-m', 'add internal operation'],
            { cwd: directory },
        );
        writeFileSync(flagsPath, 'invalid working tree source');
        const fromTargetRef = collectBreakingChangeDeclarationsBetweenRefs(
            'HEAD~1',
            'HEAD',
        );
        assert.deepStrictEqual(fromTargetRef.diagnostics, []);
        assert.strictEqual(fromTargetRef.advisories[0]?.id, 'internal');
        writeFileSync(
            flagsPath,
            "export enum FeatureFlags { Another = 'other-flag', }",
        );
        execFileSync('git', ['add', '.'], { cwd: directory });
        execFileSync('git', ['commit', '--quiet', '-m', 'retire flag'], {
            cwd: directory,
        });
        assert.deepStrictEqual(
            collectBreakingChangeDeclarationsBetweenRefs('HEAD~1', 'HEAD')
                .diagnostics,
            [],
        );
        assert.ok(
            collectBreakingChangeDeclarationsBetweenRefs(
                'HEAD~2',
                'HEAD',
            ).diagnostics.some(({ message }) =>
                message.includes('unknown feature flag'),
            ),
        );
    } finally {
        process.chdir(previousCwd);
        rmSync(directory, { recursive: true, force: true });
    }
});

for (const kind of ['rest', 'mcp'] as const) {
    test(`matcher rejects ${kind} coverage for the other surface`, () => {
        const advisory: AdvisoryDeclaration = {
            id: 'internal-operation',
            reason: first.reason,
            requiredStop: false,
            impact: {
                kind: 'no-external-callers',
                firstPartyOnly:
                    'Only the Lightdash settings page calls this operation.',
                covers: { rest: ['POST /x'], mcp: ['POST', 'x'] },
            },
        };
        const rest = {
            checked: true,
            breaking: true,
            changes: ['POST /x — endpoint removed'],
            breakingCount: 1,
        };
        const mcp = { ...rest, changes: ['MCP tool `x` removed'] };
        assert.deepStrictEqual(uncoveredFindings(rest, [advisory], 'rest'), []);
        assert.deepStrictEqual(uncoveredFindings(mcp, [advisory], 'mcp'), []);
        const otherSurface = kind === 'rest' ? mcp : rest;
        assert.deepStrictEqual(
            uncoveredFindings(otherSurface, [advisory], kind),
            otherSurface.changes,
        );
    });
}

const impact = {
    kind: 'no-external-callers' as const,
    featureFlag: 'agent-identity',
    covers: { rest: ['POST /x'], mcp: [] },
};
const internalEntry = { ...first, impact };
const flags = () => new Set(['agent-identity']);

test('advisories are partitioned from ordinary declarations', () => {
    const result = diffBreakingChangeDeclarations(
        null,
        registry({ internal: internalEntry }),
        undefined,
        flags,
    );
    assert.deepStrictEqual(result, {
        added: [],
        advisories: [{ id: 'internal', ...internalEntry }],
        diagnostics: [],
    });
    assert.deepStrictEqual(
        partitionDeclarations([
            { id: 'ordinary', ...first },
            { id: 'internal', ...internalEntry },
        ]),
        {
            ordinary: [{ id: 'ordinary', ...first }],
            advisories: result.advisories,
        },
    );
});

test('flag validation uses enum values and fails closed', () => {
    assert.deepStrictEqual(
        [
            ...parseFeatureFlagValues(`// heading
export enum FeatureFlags {
    /* feature */ AgentIdentity = 'agent-identity', // note
    Another = 'another-flag',
}`),
        ],
        ['agent-identity', 'another-flag'],
    );
    for (const source of [
        '',
        'export enum FeatureFlags {}',
        `const text = "export enum FeatureFlags { A = 'fake', }";`,
        "export enum FeatureFlags { A = 'a',",
        "export enum FeatureFlags { A = 'a', A = 'b', }",
        'export enum FeatureFlags { A = getFlag(), }',
        "export enum FeatureFlags { A = 'a', B = 3, }",
        "export enum FeatureFlags { A = 'a' }",
    ]) {
        assert.throws(() => parseFeatureFlagValues(source));
    }
    const result = diffBreakingChangeDeclarations(
        null,
        registry({ internal: internalEntry }),
        undefined,
        () => new Set(['AgentIdentity']),
    );
    assert.ok(
        result.diagnostics.some(
            ({ message }) =>
                message ===
                'declaration "internal" names unknown feature flag "agent-identity"',
        ),
    );
    for (const source of [
        () => parseFeatureFlagValues('bad enum'),
        () => new Set<string>(),
    ]) {
        assert.ok(
            diffBreakingChangeDeclarations(
                null,
                registry({ internal: internalEntry }),
                undefined,
                source,
            ).diagnostics.length > 0,
        );
    }
    assert.ok(
        diffBreakingChangeDeclarations(
            null,
            registry({ internal: internalEntry }),
        ).diagnostics.length > 0,
    );
    const historical = registry({ internal: internalEntry });
    assert.deepStrictEqual(
        diffBreakingChangeDeclarations(
            historical,
            historical,
            undefined,
            () => {
                throw new Error('must not read historical flags');
            },
        ).diagnostics,
        [],
    );
    assert.ok(
        parseFeatureFlagValues(
            readFileSync('packages/common/src/types/featureFlags.ts', 'utf8'),
        ).has('agent-identity'),
    );
});

test('invalid advisory shapes fail in the loader and strict schema', () => {
    const validate = new Ajv({ strict: true }).compile(
        JSON.parse(
            readFileSync(
                'scripts/release-safety-declarations.schema.json',
                'utf8',
            ),
        ),
    );
    const invalid = [
        {
            ...internalEntry,
            migration:
                'packages/backend/src/database/migrations/20260819000000_break.ts',
        },
        { ...internalEntry, requiredStop: true },
        { ...internalEntry, reason: 'short' },
        { ...internalEntry, reason: '    too    short    ' },
        { ...internalEntry, impact: { ...impact, kind: 'other' } },
        { ...internalEntry, impact: { ...impact, surprise: true } },
        {
            ...internalEntry,
            impact: {
                ...impact,
                firstPartyOnly:
                    'Only the Lightdash settings page calls this operation.',
            },
        },
        {
            ...internalEntry,
            impact: { kind: impact.kind, covers: impact.covers },
        },
        {
            ...internalEntry,
            impact: {
                kind: impact.kind,
                firstPartyOnly: 'short',
                covers: impact.covers,
            },
        },
        ...[
            { rest: [], mcp: [] },
            { rest: ['post /x'], mcp: [] },
            { rest: ['POST x'], mcp: [] },
            { rest: ['POST /x — removed'], mcp: [] },
            { rest: ['POST /x', 'POST /x'], mcp: [] },
            { rest: [], mcp: ['x', 'x'] },
            { rest: [], mcp: ['has space'] },
            { rest: [], mcp: ['x\n'] },
            { rest: ['POST /x\n'], mcp: [] },
            { rest: [], mcp: ['`x`'] },
            { rest: [], mcp: [''] },
            { rest: ['POST /x'] },
            { rest: ['POST /x'], mcp: [], unknown: [] },
        ].map((covers) => ({
            ...internalEntry,
            impact: { ...impact, covers },
        })),
    ];
    for (const entry of invalid) {
        assert.ok(
            parseBreakingChangeDeclarationsFile(registry({ internal: entry }))
                .diagnostics.length > 0,
            JSON.stringify(entry),
        );
        assert.strictEqual(
            validate({ declarations: { internal: entry } }),
            false,
            JSON.stringify(entry),
        );
    }
    for (const entry of [
        internalEntry,
        {
            ...first,
            impact: {
                kind: impact.kind,
                firstPartyOnly:
                    'Only the Lightdash settings page calls this operation.',
                covers: impact.covers,
            },
        },
    ]) {
        assert.deepStrictEqual(
            parseBreakingChangeDeclarationsFile(registry({ internal: entry }))
                .diagnostics,
            [],
        );
        assert.strictEqual(
            validate({ declarations: { internal: entry } }),
            true,
            JSON.stringify(validate.errors),
        );
    }
});

test('impact is immutable and duplicate reasons cannot be reclassified', () => {
    for (const [before, after] of [
        [first, internalEntry],
        [internalEntry, first],
        [
            internalEntry,
            {
                ...internalEntry,
                impact: { ...impact, covers: { rest: ['GET /x'], mcp: [] } },
            },
        ],
        [
            internalEntry,
            {
                ...internalEntry,
                impact: { ...impact, featureFlag: 'another-flag' },
            },
        ],
    ]) {
        assert.ok(
            diffBreakingChangeDeclarations(
                registry({ internal: before }),
                registry({ internal: after }),
                undefined,
                flags,
            ).diagnostics.some(({ message }) => message.includes('changed')),
        );
    }
    const copied = diffBreakingChangeDeclarations(
        registry({ original: first }),
        registry({ original: first, copy: internalEntry }),
        undefined,
        flags,
    );
    assert.ok(
        copied.diagnostics.some(({ message }) =>
            message.includes('duplicates'),
        ),
    );
    const newDuplicates = diffBreakingChangeDeclarations(
        null,
        registry({ original: first, copy: internalEntry }),
        undefined,
        flags,
    );
    assert.ok(
        newDuplicates.diagnostics.some(({ message }) =>
            message.includes('duplicates'),
        ),
    );
});

test('matcher requires exact operations and retains truncated findings', () => {
    const advisory: AdvisoryDeclaration = {
        id: 'internal',
        ...internalEntry,
        requiredStop: false,
    };
    const surface = {
        checked: true,
        breaking: true,
        changes: ['POST /x — endpoint removed'],
        breakingCount: 1,
    };
    assert.deepStrictEqual(uncoveredFindings(surface, [advisory], 'rest'), []);
    assert.deepStrictEqual(
        unmatchedCoverEntries(surface, [advisory], 'rest'),
        [],
    );
    assert.deepStrictEqual(
        uncoveredFindings(
            { ...surface, changes: ['POST /xy — endpoint removed'] },
            [advisory],
            'rest',
        ),
        ['POST /xy — endpoint removed'],
    );
    assert.deepStrictEqual(
        uncoveredFindings({ ...surface, breakingCount: 2 }, [advisory], 'rest'),
        [...surface.changes, '… and 1 more breaking change(s)'],
    );
    assert.deepStrictEqual(
        uncoveredFindings(
            {
                ...surface,
                changes: [
                    ...surface.changes,
                    '… and 1 more breaking change(s)',
                ],
                breakingCount: 2,
            },
            [advisory],
            'rest',
        ),
        [...surface.changes, '… and 1 more breaking change(s)'],
    );
    assert.deepStrictEqual(
        uncoveredFindings({ ...surface, checked: false }, [advisory], 'rest'),
        surface.changes,
    );
    assert.deepStrictEqual(
        unmatchedCoverEntries(
            { ...surface, checked: false },
            [advisory],
            'rest',
        ),
        [],
    );
    const mcpAdvisory = {
        ...advisory,
        impact: { ...impact, covers: { rest: [], mcp: ['x'] } },
    };
    for (const finding of [
        'MCP tool `x` removed',
        'MCP tool `x`: parameter removed',
    ]) {
        assert.deepStrictEqual(
            uncoveredFindings(
                { ...surface, changes: [finding] },
                [mcpAdvisory],
                'mcp',
            ),
            [],
        );
    }
    for (const finding of ['MCP tool `xy` removed', 'MCP tool `x` renamed']) {
        assert.deepStrictEqual(
            uncoveredFindings(
                { ...surface, changes: [finding] },
                [mcpAdvisory],
                'mcp',
            ),
            [finding],
        );
    }
});

test('an overflow line disables all advisory matching even without a breaking count', () => {
    for (const kind of ['rest', 'mcp'] as const) {
        const changes = [
            kind === 'rest' ? 'POST /x — endpoint removed' : 'MCP tool `x` removed',
            '… and 1 more breaking change(s)',
        ];
        const advisory: AdvisoryDeclaration = {
            id: 'internal',
            ...internalEntry,
            requiredStop: false,
            impact: { ...impact, covers: { rest: ['POST /x'], mcp: ['x'] } },
        };
        assert.deepStrictEqual(
            uncoveredFindings({ checked: true, breaking: true, changes }, [advisory], kind),
            changes,
        );
    }
});

test('the unchanged real registry parses without diagnostics', () => {
    assert.deepStrictEqual(
        parseBreakingChangeDeclarationsFile(
            readFileSync('release-safety.declarations.json', 'utf8'),
        ).diagnostics,
        [],
    );
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
