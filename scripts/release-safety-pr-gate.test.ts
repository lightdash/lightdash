import * as assert from 'assert';
import type {
    BreakingChangeDeclaration,
    BreakingChangeDeclarationDiff,
} from './release-safety-declarations';
import {
    detectLegacyInlineBreakingDeclarations,
    evaluateReleaseSafetyGate,
    ReleaseSafetyGateMarker,
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
    return { added, diagnostics };
}

function evaluate(
    releaseMarker: ReleaseSafetyGateMarker,
    declarationChanges: BreakingChangeDeclarationDiff = changes(),
    inlineDeclarationDiagnostics: ReturnType<
        typeof detectLegacyInlineBreakingDeclarations
    > = [],
) {
    return evaluateReleaseSafetyGate({
        marker: releaseMarker,
        markerPath,
        declarationChanges,
        inlineDeclarationDiagnostics,
    });
}

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

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
