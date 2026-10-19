import * as assert from 'assert';
import { breakingChangeDecisionBrief } from './breaking-change-gate-policy';
import type {
    BreakingChangeDeclaration,
    AdvisoryDeclaration,
    BreakingChangeDeclarationDiff,
} from './release-safety-declarations';
import {
    detectIncompleteMigrationMetadata,
    detectLegacyInlineBreakingDeclarations,
    evaluateReleaseSafetyGate,
    ReleaseSafetyGateMarker,
    validateGitSha,
} from './release-safety-pr-gate';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed += 1;
    } catch (error) {
        failures.push(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function marker(rest: boolean, mcp: boolean): ReleaseSafetyGateMarker {
    return {
        api: {
            rest: { checked: true, breaking: rest, changes: [] },
            mcp: { checked: true, breaking: mcp, changes: [] },
        },
    };
}

const markerPath = '/tmp/release-safety.json';
const declaration: BreakingChangeDeclaration = {
    id: 'remove-request-field',
    reason: 'Existing clients require a staged rollout.',
    requiredStop: false,
};

function changes(
    added: BreakingChangeDeclaration[] = [],
    diagnostics: BreakingChangeDeclarationDiff['diagnostics'] = [],
): BreakingChangeDeclarationDiff {
    return { added, advisories: [], diagnostics };
}

function evaluate(
    releaseMarker: ReleaseSafetyGateMarker,
    declarationChanges: BreakingChangeDeclarationDiff = changes(),
    inlineDeclarationDiagnostics: ReturnType<
        typeof detectLegacyInlineBreakingDeclarations
    > = [],
    migrationDiagnostics: ReturnType<
        typeof detectIncompleteMigrationMetadata
    > = [],
) {
    return evaluateReleaseSafetyGate({
        marker: releaseMarker,
        markerPath,
        declarationChanges,
        inlineDeclarationDiagnostics,
        migrationDiagnostics,
    });
}

const migrationPath =
    'packages/backend/src/database/migrations/20260820120000_example.ts';

test('git ref validation rejects option-like input', () => {
    assert.throws(
        () => validateGitSha('--not-a-ref'),
        /full 40-character lowercase hex SHA/,
    );
    assert.strictEqual(validateGitSha('a'.repeat(40)), 'a'.repeat(40));
});

test('dynamic SQL reports the parse failure remedy', () => {
    const diagnostics = detectIncompleteMigrationMetadata([
        {
            file: migrationPath,
            source: `export async function up(knex) { await knex.raw(buildSql()); }`,
        },
    ]);
    assert.ok(
        diagnostics.some(({ message }) =>
            message.includes('write the name inline, or use a module constant'),
        ),
    );
    assert.deepStrictEqual(
        evaluate(marker(false, false), changes(), [], diagnostics),
        diagnostics,
    );
});

test('column alter reports the rewrite declaration remedy', () => {
    const diagnostics = detectIncompleteMigrationMetadata([
        {
            file: migrationPath,
            source: `export async function up(knex) {
                await knex.schema.alterTable('users', (table) => {
                    table.string('name', 100).alter();
                });
            }`,
        },
    ]);
    assert.ok(
        diagnostics.some(({ message }) =>
            message.includes('declare whether this rewrites the table'),
        ),
    );
    assert.ok(
        diagnostics.every(
            ({ message }) => !message.includes('write the name inline'),
        ),
    );
});

test('dynamic table argument reports the table-name remedy', () => {
    const diagnostics = detectIncompleteMigrationMetadata([
        {
            file: migrationPath,
            source: `export async function up(knex) {
                await knex.schema.createTable(getTableName(), () => undefined);
            }`,
        },
    ]);
    assert.ok(
        diagnostics.some(({ message }) =>
            message.includes(
                'name the table with a literal or a module constant',
            ),
        ),
    );
});

test('an explicit migration classification satisfies incomplete metadata', () => {
    const diagnostics = detectIncompleteMigrationMetadata([
        {
            file: migrationPath,
            source: `
                export const classification = { kind: 'safe', reason: 'The type widening does not rewrite existing rows.' };
                export async function up(knex) {
                    await knex.schema.alterTable('users', (table) => {
                        table.string('name', 100).alter();
                    });
                }
            `,
        },
    ]);
    assert.deepStrictEqual(diagnostics, []);
});

test('a matching migration declaration satisfies incomplete metadata', () => {
    const diagnostics = detectIncompleteMigrationMetadata(
        [
            {
                file: migrationPath,
                source: `export async function up(knex) { await knex.raw(buildSql()); }`,
            },
        ],
        [{ ...declaration, migration: migrationPath }],
    );
    assert.deepStrictEqual(diagnostics, []);
});

test('breaking REST without a new declaration fails', () => {
    const diagnostics = evaluate(marker(true, false));
    assert.ok(diagnostics.some(({ level }) => level === 'error'));
    assert.ok(
        diagnostics.some(({ message }) => message.includes('breaking REST')),
    );
    const decisionBrief = diagnostics.find(({ message }) =>
        message.includes('BREAKING-CHANGE DECISION BRIEF'),
    );
    assert.ok(decisionBrief?.message.includes(`${markerPath}:1`));
    assert.ok(
        decisionBrief?.message.includes(
            'redesign to expand-only — e.g. deprecate-now-drop-later',
        ),
    );
    assert.ok(
        decisionBrief?.message.includes(
            'declare — flips this release to not-rolling-safe, advises Recreate to every self-hosted customer',
        ),
    );
});

test('breaking REST with a valid added declaration passes', () => {
    assert.deepStrictEqual(
        evaluate(marker(true, false), changes([declaration])),
        [],
    );
});

test('breaking MCP with a valid added declaration passes', () => {
    assert.deepStrictEqual(
        evaluate(marker(false, true), changes([declaration])),
        [],
    );
});

test('one added declaration covers simultaneous REST and MCP breaks', () => {
    assert.deepStrictEqual(
        evaluate(marker(true, true), changes([declaration])),
        [],
    );
});

test('a migration declaration is excluded from API coverage', () => {
    const diagnostics = evaluate(
        marker(true, false),
        changes([
            {
                ...declaration,
                migration:
                    'packages/backend/src/database/migrations/20260810120000_example.ts',
            },
        ]),
    );
    assert.ok(diagnostics.some(({ level }) => level === 'warning'));
    assert.ok(diagnostics.some(({ level }) => level === 'error'));
});

test('hollow declaration reasons do not satisfy the API gate', () => {
    const hollowReasons = [
        '',
        '   ',
        'breaking change',
        'fix',
        'incompatibilityincompatibility',
        '<operator-facing reason>',
    ];
    for (const reason of hollowReasons) {
        const diagnostics = evaluate(
            marker(false, true),
            changes([{ ...declaration, reason }]),
        );
        assert.ok(
            diagnostics.some(({ message }) =>
                message.includes('describe what breaks and for whom'),
            ),
            `expected hollow reason to fail: ${JSON.stringify(reason)}`,
        );
        assert.ok(
            diagnostics.some(({ message }) =>
                message.includes('BREAKING-CHANGE DECISION BRIEF'),
            ),
        );
    }
});

test('a substantive declaration reason satisfies the API gate', () => {
    assert.deepStrictEqual(
        evaluate(
            marker(true, false),
            changes([
                {
                    ...declaration,
                    reason: 'Existing API clients still send the removed request field.',
                },
            ]),
        ),
        [],
    );
});

test('a spent declaration does not satisfy a later API gate', () => {
    const diagnostics = evaluate(marker(true, false), changes());
    assert.ok(
        diagnostics.some(({ message }) =>
            message.includes('BREAKING-CHANGE DECISION BRIEF'),
        ),
    );
});

test('registry violations fail before a clean API early return', () => {
    const diagnostics = evaluate(
        marker(false, false),
        changes(
            [],
            [
                {
                    file: 'release-safety.declarations.json',
                    line: 1,
                    message: 'declaration "old-break" was removed',
                },
            ],
        ),
    );
    assert.deepStrictEqual(diagnostics, [
        {
            level: 'error',
            file: 'release-safety.declarations.json',
            line: 1,
            message: 'declaration "old-break" was removed',
        },
    ]);
});

test('a changed legacy inline declaration fails a clean API gate', () => {
    const inlineDeclarationDiagnostics = detectLegacyInlineBreakingDeclarations(
        [
            {
                file: 'packages/backend/src/services/example.ts',
                source: `export const breaking = { reason: 'Old workers still call this service.', requiredStop: false };`,
            },
            {
                file: 'packages/common/src/example.test.ts',
                source: `export const breaking = { reason: 'Test fixture.', requiredStop: false };`,
            },
            {
                file: 'packages/backend/src/database/migrations/20260819000000_example.ts',
                source: `export const breaking = { reason: 'Migration declaration.', requiredStop: false };`,
            },
            {
                file: 'packages/common/src/comment.ts',
                source: `// export const breaking = { reason: 'Comment.', requiredStop: false };`,
            },
        ],
    );
    const diagnostics = evaluate(
        marker(false, false),
        changes(),
        inlineDeclarationDiagnostics,
    );
    assert.deepStrictEqual(diagnostics, [
        {
            level: 'error',
            file: 'packages/backend/src/services/example.ts',
            line: 1,
            message:
                'inline export const breaking is not supported; add a new stable ID to release-safety.declarations.json',
        },
    ]);
});

test('a clean marker requires no declaration', () => {
    assert.deepStrictEqual(evaluate(marker(false, false)), []);
});

const advisory: AdvisoryDeclaration = {
    id: 'internal-operation',
    reason: 'Only the Lightdash settings page calls this operation.',
    requiredStop: false,
    impact: {
        kind: 'no-external-callers',
        firstPartyOnly:
            'Only the Lightdash settings page calls this operation.',
        covers: { rest: ['POST /x'], mcp: [] },
    },
};

function advisoryChanges(entry = advisory): BreakingChangeDeclarationDiff {
    return { added: [], advisories: [entry], diagnostics: [] };
}

function findingMarker(
    surface: 'rest' | 'mcp',
    finding: string,
): ReleaseSafetyGateMarker {
    const result = marker(false, false);
    result.api[surface] = {
        checked: true,
        breaking: true,
        changes: [finding],
        breakingCount: 1,
    };
    return result;
}

test('an advisory covers its exact REST operation', () => {
    assert.deepStrictEqual(
        evaluate(
            findingMarker('rest', 'POST /x — endpoint removed'),
            advisoryChanges(),
        ),
        [],
    );
});

test('MCP covers cannot satisfy REST findings', () => {
    const diagnostics = evaluate(
        findingMarker('rest', 'POST /x — endpoint removed'),
        advisoryChanges({
            ...advisory,
            impact: {
                ...advisory.impact,
                covers: { rest: [], mcp: ['POST', 'x'] },
            },
        }),
    );
    assert.ok(
        diagnostics.some(({ message }) =>
            message.includes('POST /x — endpoint removed'),
        ),
    );
    assert.ok(
        diagnostics.some(({ message }) => message.includes('covers "POST"')),
    );
});

test('REST covers cannot satisfy MCP findings', () => {
    const diagnostics = evaluate(
        findingMarker('mcp', 'MCP tool `x` removed'),
        advisoryChanges(),
    );
    assert.ok(
        diagnostics.some(({ message }) =>
            message.includes('MCP tool `x` removed'),
        ),
    );
    assert.ok(
        diagnostics.some(({ message }) => message.includes('covers "POST /x"')),
    );
});

test('uncovered extra findings fail with the API-only third path', () => {
    const releaseMarker = findingMarker('rest', 'POST /x — endpoint removed');
    releaseMarker.api.rest.changes.push('GET /other — endpoint removed');
    releaseMarker.api.rest.breakingCount = 2;
    const diagnostics = evaluate(releaseMarker, advisoryChanges());
    assert.ok(
        diagnostics.some(
            ({ message }) =>
                message.includes('GET /other — endpoint removed') &&
                message.includes('Path 3 — declare no external callers'),
        ),
    );
    assert.deepStrictEqual(
        evaluate(releaseMarker, { ...advisoryChanges(), added: [declaration] }),
        [],
    );
});

test('MCP advisory satisfies the gate for its exact tool', () => {
    assert.deepStrictEqual(
        evaluate(
            findingMarker('mcp', 'MCP tool `x`: argument removed'),
            advisoryChanges({
                ...advisory,
                impact: {
                    ...advisory.impact,
                    covers: { rest: [], mcp: ['x'] },
                },
            }),
        ),
        [],
    );
});

test('a truncated finding list stays uncovered in the gate', () => {
    for (const hasOverflow of [false, true]) {
        const releaseMarker = findingMarker(
            'rest',
            'POST /x — endpoint removed',
        );
        releaseMarker.api.rest.breakingCount = 2;
        if (hasOverflow)
            releaseMarker.api.rest.changes.push(
                '… and 1 more breaking change(s)',
            );
        assert.ok(
            evaluate(releaseMarker, advisoryChanges()).some(({ message }) =>
                message.includes('… and 1 more breaking change(s)'),
            ),
        );
    }
});

test('51 REST findings with all 50 listed operations covered still fail the gate', () => {
    const operations = Array.from({ length: 50 }, (_, index) => `POST /internal/${index}`);
    const findings = operations.map((operation) => `${operation} — endpoint removed`);
    const releaseMarker = marker(false, false);
    releaseMarker.api.rest = {
        checked: true,
        breaking: true,
        breakingCount: 51,
        changes: [...findings, '… and 1 more breaking change(s)'],
    };
    const diagnostics = evaluate(releaseMarker, advisoryChanges({
        ...advisory,
        impact: { ...advisory.impact, covers: { rest: operations, mcp: [] } },
    }));
    const error = diagnostics.find(({ level }) => level === 'error');
    assert.ok(error);
    for (const finding of releaseMarker.api.rest.changes) {
        assert.ok(error.message.includes(finding), finding);
    }
});

test('unmatched covers fail even when no surface is breaking', () => {
    const diagnostics = evaluate(marker(false, false), advisoryChanges());
    assert.ok(
        diagnostics.some(
            ({ message }) =>
                message ===
                'declaration "internal-operation" covers "POST /x" but the PR has no breaking finding for it',
        ),
    );
    const unchecked = marker(false, false);
    unchecked.api.rest = { checked: false, breaking: 'unknown', changes: [] };
    assert.deepStrictEqual(
        evaluate(unchecked, advisoryChanges()),
        evaluate(unchecked),
    );
});

test('migration decision briefs do not offer no-external-callers', () => {
    const brief = breakingChangeDecisionBrief({
        file: migrationPath,
        line: 1,
        pattern: 'drop table',
        declarationLocation: 'registry',
    });
    assert.ok(!brief.includes('Path 3'));
    assert.ok(brief.includes('confirm with a human'));
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
