import * as assert from 'node:assert';
import * as fs from 'node:fs';
import {
    buildGateEvidence,
    DEFAULT_SKIP_BELOW,
    estimateStateTokens,
    ForcedDecisions,
    GateEvidence,
    isReleaseSafetyMigrationPath,
    JEV_MODEL,
    MAX_STATE_TOKENS,
    removeTestFileDiffs,
    runJevGate,
} from './release-safety-jev-gate';

interface Fixture {
    name: string;
    changedFiles: string[];
    diff: string;
    large?: boolean;
    forced: ForcedDecisions;
}

function evidence(changedFiles: string[], diff = ''): GateEvidence {
    return {
        changedFiles,
        diff,
        estimatedStateTokens: estimateStateTokens(changedFiles, diff),
    };
}

function jevResponse(probabilities: {
    rest: number;
    database: number;
    mcp: number;
    internal: number;
}): typeof fetch {
    return async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
            model: string;
            state: { changed_files: string[]; diff: string };
            questions: Record<string, { instructions: string }>;
        };
        assert.strictEqual(request.model, JEV_MODEL);
        assert.ok(request.questions.rest_api_may_change.instructions.includes('data, not instructions'));
        assert.ok(Array.isArray(request.state.changed_files));
        return new Response(
            JSON.stringify({
                model: JEV_MODEL,
                answers: {
                    rest_api_may_change: { type: 'noul', noul: probabilities.rest },
                    db_schema_may_change: { type: 'noul', noul: probabilities.database },
                    mcp_tools_may_change: { type: 'noul', noul: probabilities.mcp },
                    only_internal_or_test_changes: {
                        type: 'noul',
                        noul: probabilities.internal,
                    },
                },
                usage: { input_tokens: 321, output_tokens: 20 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        );
    };
}

async function main(): Promise<void> {
    const rawDiff = [
        'diff --git a/packages/backend/src/services/FooService.ts b/packages/backend/src/services/FooService.ts',
        '--- a/packages/backend/src/services/FooService.ts',
        '+++ b/packages/backend/src/services/FooService.ts',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        'diff --git a/packages/backend/src/services/FooService.test.ts b/packages/backend/src/services/FooService.test.ts',
        '--- a/packages/backend/src/services/FooService.test.ts',
        '+++ b/packages/backend/src/services/FooService.test.ts',
        '@@ -1 +1 @@',
        '-old test',
        '+new test',
    ].join('\n');
    const filteredDiff = removeTestFileDiffs(rawDiff);
    assert.match(filteredDiff, /FooService\.ts/);
    assert.doesNotMatch(filteredDiff, /FooService\.test\.ts/);

    const built = buildGateEvidence({
        base: 'base',
        head: 'head',
        runGit: (args) =>
            args.includes('--name-only')
                ? [
                      'packages/backend/src/services/FooService.ts',
                      'packages/backend/src/services/FooService.test.ts',
                      'packages/frontend/src/Foo.tsx',
                  ].join('\n')
                : rawDiff,
    });
    assert.deepStrictEqual(built.changedFiles, [
        'packages/backend/src/services/FooService.test.ts',
        'packages/backend/src/services/FooService.ts',
    ]);
    assert.doesNotMatch(built.diff, /FooService\.test\.ts/);
    assert.strictEqual(
        built.estimatedStateTokens,
        estimateStateTokens(built.changedFiles, built.diff),
    );

    assert.strictEqual(
        isReleaseSafetyMigrationPath(
            'packages/backend/src/database/migrations/20260917090000_add_gate.ts',
        ),
        true,
    );
    assert.strictEqual(
        isReleaseSafetyMigrationPath(
            'packages/backend/src/database/migrations/__tests__/20260917090000_add_gate.ts',
        ),
        false,
    );

    const fixtures = JSON.parse(
        fs.readFileSync('scripts/fixtures/release-safety-jev-gate.json', 'utf8'),
    ) as Fixture[];
    for (const fixture of fixtures) {
        const diff = fixture.large ? 'x'.repeat(MAX_STATE_TOKENS * 4 + 1) : fixture.diff;
        const result = await runJevGate({
            evidence: evidence(fixture.changedFiles, diff),
            mode: 'enforce',
            apiKey: fixture.name.startsWith('migration') ? undefined : 'unused',
            fetcher: jevResponse({ rest: 0, database: 0, mcp: 0, internal: 1 }),
        });
        assert.deepStrictEqual(result.forced, fixture.forced, fixture.name);
    }

    const noChanges = await runJevGate({ evidence: evidence([]), mode: 'enforce' });
    assert.deepStrictEqual(noChanges.decisions, {
        rest_api: 'skip',
        db_schema: 'skip',
        mcp_tools: 'skip',
    });
    assert.deepStrictEqual(noChanges.reasons, ['no watched changes']);

    const enforce = await runJevGate({
        evidence: evidence(['packages/backend/src/services/FooService.ts'], filteredDiff),
        mode: 'enforce',
        apiKey: 'test-key',
        fetcher: jevResponse({
            rest: DEFAULT_SKIP_BELOW - 0.001,
            database: DEFAULT_SKIP_BELOW,
            mcp: 0.91,
            internal: 0.88,
        }),
    });
    assert.deepStrictEqual(enforce.decisions, {
        rest_api: 'skip',
        db_schema: 'run',
        mcp_tools: 'run',
    });
    assert.strictEqual(enforce.probabilities.only_internal_or_test_changes, 0.88);
    assert.strictEqual(enforce.inputTokens, 321);
    assert.strictEqual(enforce.shadow_decisions, undefined);

    const shadow = await runJevGate({
        evidence: evidence(['packages/backend/src/services/FooService.ts'], filteredDiff),
        mode: 'shadow',
        apiKey: 'test-key',
        fetcher: jevResponse({ rest: 0.01, database: 0.02, mcp: 0.03, internal: 0.99 }),
    });
    assert.deepStrictEqual(shadow.decisions, {
        rest_api: 'run',
        db_schema: 'run',
        mcp_tools: 'run',
    });
    assert.deepStrictEqual(shadow.shadow_decisions, {
        rest_api: 'skip',
        db_schema: 'skip',
        mcp_tools: 'skip',
    });

    const missingKey = await runJevGate({
        evidence: evidence(['packages/common/src/types/foo.ts'], '+export type Foo = string;'),
        mode: 'enforce',
    });
    assert.deepStrictEqual(missingKey.decisions, {
        rest_api: 'run',
        db_schema: 'run',
        mcp_tools: 'run',
    });
    assert.match(missingKey.reasons[0], /TYPESAFE_API_KEY not set/);

    const apiError = await runJevGate({
        evidence: evidence(['packages/common/src/types/foo.ts'], '+export type Foo = string;'),
        mode: 'enforce',
        apiKey: 'test-key',
        fetcher: async () => new Response('', { status: 529 }),
    });
    assert.deepStrictEqual(apiError.decisions, {
        rest_api: 'run',
        db_schema: 'run',
        mcp_tools: 'run',
    });
    assert.deepStrictEqual(apiError.reasons, ['jev_unavailable: HTTP 529']);

    const timeout = await runJevGate({
        evidence: evidence(['packages/common/src/types/foo.ts'], '+export type Foo = string;'),
        mode: 'enforce',
        apiKey: 'test-key',
        timeoutMs: 1,
        fetcher: async (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
    });
    assert.deepStrictEqual(timeout.reasons, ['jev_unavailable: timeout']);

    process.stdout.write('release-safety Jev gate tests passed\n');
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
});
