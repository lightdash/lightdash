import * as assert from 'assert';
import {
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

const declaration =
    "export const breaking = { reason: 'Existing clients require a staged rollout', requiredStop: false };";
const backendSource = 'packages/backend/src/controllers/example.ts';
const commonSource = 'packages/common/src/types/example.ts';
const migrationSource =
    'packages/backend/src/database/migrations/20260810120000_example.ts';
const markerPath = '/tmp/release-safety.json';

function evaluate(
    releaseMarker: ReleaseSafetyGateMarker,
    changedFiles: string[],
    sources: Record<string, string> = {},
) {
    return evaluateReleaseSafetyGate({
        marker: releaseMarker,
        markerPath,
        changedFiles,
        readFile: (file) => sources[file] ?? '',
    });
}

test('breaking REST without a declaration fails', () => {
    const diagnostics = evaluate(marker(true, false), [backendSource]);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.level === 'error'));
    assert.ok(
        diagnostics.some((diagnostic) =>
            diagnostic.message.includes('breaking REST'),
        ),
    );
});

test('breaking REST with a valid changed declaration passes', () => {
    assert.deepStrictEqual(
        evaluate(marker(true, false), [backendSource], {
            [backendSource]: declaration,
        }),
        [],
    );
});

test('breaking MCP without a declaration fails', () => {
    const diagnostics = evaluate(marker(false, true), [commonSource]);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.level === 'error'));
    assert.ok(
        diagnostics.some((diagnostic) =>
            diagnostic.message.includes('breaking MCP'),
        ),
    );
});

test('breaking MCP with a valid changed declaration passes', () => {
    assert.deepStrictEqual(
        evaluate(marker(false, true), [commonSource], {
            [commonSource]: declaration,
        }),
        [],
    );
});

test('one declaration covers simultaneous REST and MCP breaks', () => {
    assert.deepStrictEqual(
        evaluate(marker(true, true), [backendSource], {
            [backendSource]: declaration,
        }),
        [],
    );
});

test('a migration declaration is excluded from API coverage', () => {
    const diagnostics = evaluate(marker(true, false), [migrationSource], {
        [migrationSource]: declaration,
    });
    assert.ok(diagnostics.some((diagnostic) => diagnostic.level === 'warning'));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.level === 'error'));
    assert.ok(diagnostics.every((diagnostic) => diagnostic.file.length > 0));
});

test('a malformed breaking declaration fails actionably', () => {
    const diagnostics = evaluate(marker(false, true), [backendSource], {
        [backendSource]:
            "export const breaking = { reason: '', requiredStop: 'sometimes' };",
    });
    assert.ok(
        diagnostics.some(
            (diagnostic) =>
                diagnostic.level === 'error' &&
                diagnostic.file === backendSource,
        ),
    );
    assert.ok(
        diagnostics.some((diagnostic) => diagnostic.message.includes('reason')),
    );
    assert.ok(
        diagnostics.some((diagnostic) =>
            diagnostic.message.includes('requiredStop'),
        ),
    );
});

test('a clean marker requires no declaration', () => {
    assert.deepStrictEqual(evaluate(marker(false, false), [backendSource]), []);
});

test('a clean marker ignores malformed breaking declaration text', () => {
    assert.deepStrictEqual(
        evaluate(marker(false, false), [backendSource], {
            [backendSource]:
                "export const breaking = { reason: '', requiredStop: 'sometimes' };",
        }),
        [],
    );
});

test('a declaration in an untouched file does not satisfy the gate', () => {
    const diagnostics = evaluate(marker(true, false), [commonSource], {
        [backendSource]: declaration,
        [commonSource]: 'export const value = 1;',
    });
    assert.ok(diagnostics.some((diagnostic) => diagnostic.level === 'error'));
});

test('a declaration in a changed test file does not satisfy the gate', () => {
    const testSource = 'packages/backend/src/controllers/example.test.ts';
    const testsDirectorySource =
        'packages/common/src/types/__tests__/example.ts';
    const diagnostics = evaluate(
        marker(true, false),
        [backendSource, testSource, testsDirectorySource],
        {
            [backendSource]: 'export const value = 1;',
            [testSource]: declaration,
            [testsDirectorySource]: declaration,
        },
    );
    assert.ok(diagnostics.some((diagnostic) => diagnostic.level === 'error'));
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
