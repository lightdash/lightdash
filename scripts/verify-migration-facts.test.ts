import { type MigrationFact, type PlanNode } from '@lightdash/common';
import * as assert from 'assert';
import {
    nothingVerifiedError,
    sqlFailureVerdict,
    summarizeVerdicts,
    summaryLine,
    verifyBatchedPlanShape,
    verifyEstimateCoversWriteTarget,
    verifyEstimateEnumeratesRows,
    verifyFact,
    verifyPerPassCost,
    verifyPlanDescribesSameWork,
    verifyPlanTables,
} from './verify-migration-facts';

let passed = 0;
const failures: string[] = [];

async function test(
    name: string,
    fn: () => void | Promise<void>,
): Promise<void> {
    try {
        await fn();
        passed += 1;
    } catch (error) {
        failures.push(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

const fact = (overrides: Partial<MigrationFact> = {}): MigrationFact => ({
    migration: '20260807000000_verify_me',
    introducedIn: '1.100.0',
    runsInTransaction: false,
    resumable: true,
    batchSize: 1000,
    lockTimeout: null,
    tables: [
        { name: 'widgets', access: ['write'], expectedLockModes: [] },
        { name: 'owners', access: ['read'], expectedLockModes: [] },
    ],
    backfill: {
        description: 'Verify widgets and owners',
        estimateSql: 'SELECT widget_id FROM widgets',
        planSql:
            'SELECT widgets.widget_id, owners.owner_id FROM widgets LEFT JOIN owners USING (owner_id)',
        supportingIndexSql: null,
    },
    notes: null,
    ...overrides,
});

const explain = (plan: PlanNode): unknown => [{ Plan: plan }];

async function main(): Promise<void> {
    await test('rejects a plan missing a declared read or write table', () => {
        const candidate = fact();
        const sql = candidate.backfill?.planSql ?? '';
        const verdict = verifyPlanTables(
            candidate,
            sql,
            explain({ 'Node Type': 'Seq Scan', 'Relation Name': 'widgets' }),
        );
        assert.strictEqual(verdict.ok, false);
        if (verdict.ok) return;
        assert.strictEqual(verdict.reason, 'plan-missing-tables');
        assert.deepStrictEqual(verdict.missingTables, ['owners']);
        assert.strictEqual(verdict.sql, sql);
    });

    await test('accepts a nested plan containing every declared read or write table', () => {
        const candidate = fact({
            tables: [
                { name: 'widgets', access: ['write'], expectedLockModes: [] },
                { name: 'owners', access: ['read'], expectedLockModes: [] },
                { name: 'audit_log', access: ['ddl'], expectedLockModes: [] },
            ],
        });
        const verdict = verifyPlanTables(
            candidate,
            candidate.backfill?.planSql ?? '',
            explain({
                'Node Type': 'Hash Join',
                Plans: [
                    { 'Node Type': 'Seq Scan', 'Relation Name': 'widgets' },
                    { 'Node Type': 'Seq Scan', 'Relation Name': 'owners' },
                ],
            }),
        );
        assert.deepStrictEqual(verdict, {
            ok: true,
            migration: candidate.migration,
        });
    });

    await test('SQL failure verdict carries the offending SQL and Postgres message', () => {
        const candidate = fact();
        const sql = 'SELECT project_uuid FROM saved_queries';
        const message = 'column "project_uuid" does not exist';
        const verdict = sqlFailureVerdict(
            candidate,
            'estimate-sql-error',
            sql,
            message,
        );
        assert.deepStrictEqual(verdict, {
            ok: false,
            migration: candidate.migration,
            reason: 'estimate-sql-error',
            sql,
            message,
            missingTables: [],
        });
    });

    await test('a fact without a backfill passes without database access', async () => {
        const candidate = fact({ backfill: null });
        const verdict = await verifyFact(candidate, {
            explain: async () => {
                throw new Error('database should not be called');
            },
            explainWithoutSeqScan: async () => {
                throw new Error('database should not be called');
            },
            executeSupportingIndex: async () => {
                throw new Error('database should not be called');
            },
        });
        assert.deepStrictEqual(verdict, {
            ok: true,
            migration: candidate.migration,
        });
    });

    await test('an estimate that counts a read-only table misses the write target', () => {
        const candidate = fact();
        const sql = 'SELECT owner_id FROM owners';
        const verdict = verifyEstimateCoversWriteTarget(
            candidate,
            sql,
            explain({ 'Node Type': 'Seq Scan', 'Relation Name': 'owners' }),
        );
        assert.strictEqual(verdict.ok, false);
        if (verdict.ok) return;
        assert.strictEqual(verdict.reason, 'estimate-misses-write-target');
        assert.deepStrictEqual(verdict.missingTables, ['widgets']);
    });

    await test('an estimate over the write target passes, and no declared write target skips the check', () => {
        const candidate = fact();
        assert.strictEqual(
            verifyEstimateCoversWriteTarget(
                candidate,
                'SELECT widget_id FROM widgets',
                explain({ 'Node Type': 'Seq Scan', 'Relation Name': 'widgets' }),
            ).ok,
            true,
        );
        const noWriteTarget = fact({
            tables: [
                { name: 'owners', access: ['read'], expectedLockModes: [] },
            ],
        });
        assert.strictEqual(
            verifyEstimateCoversWriteTarget(
                noWriteTarget,
                'SELECT owner_id FROM owners',
                explain({ 'Node Type': 'Seq Scan', 'Relation Name': 'owners' }),
            ).ok,
            true,
        );
    });

    await test("a batched migration's plan must carry its batch limit", () => {
        const candidate = fact();
        const stripped = 'SELECT widgets.widget_id FROM widgets';
        const verdict = verifyBatchedPlanShape(candidate, stripped);
        assert.strictEqual(verdict.ok, false);
        if (verdict.ok) return;
        assert.strictEqual(verdict.reason, 'plan-missing-batch-limit');
        assert.strictEqual(
            verifyBatchedPlanShape(candidate, `${stripped} LIMIT 1000`).ok,
            true,
        );
        assert.strictEqual(
            verifyBatchedPlanShape(fact({ batchSize: null }), stripped).ok,
            true,
        );
    });

    await test('a batched plan that still seq-scans its write target understates per-pass cost', () => {
        const candidate = fact();
        const verdict = verifyPerPassCost(
            candidate,
            'SELECT widget_id FROM widgets LIMIT 1000',
            explain({ 'Node Type': 'Seq Scan', 'Relation Name': 'widgets' }),
        );
        assert.strictEqual(verdict.ok, false);
        if (verdict.ok) return;
        assert.strictEqual(verdict.reason, 'per-pass-cost-understated');
    });

    await test('per-pass cost passes on an index path, when already declared table, and when unbatched', () => {
        const indexed = explain({
            'Node Type': 'Index Only Scan',
            'Relation Name': 'widgets',
        });
        const seqScanned = explain({
            'Node Type': 'Seq Scan',
            'Relation Name': 'widgets',
        });
        assert.strictEqual(verifyPerPassCost(fact(), 'x', indexed).ok, true);
        assert.strictEqual(
            verifyPerPassCost(fact({ batchSize: null }), 'x', seqScanned).ok,
            true,
        );
        const declaredTable = fact();
        declaredTable.backfill = {
            ...declaredTable.backfill!,
            perPassCost: 'table',
        };
        assert.strictEqual(
            verifyPerPassCost(declaredTable, 'x', seqScanned).ok,
            true,
        );
    });

    await test('a single-row planSql for a whole-table rewrite describes less work', () => {
        const candidate = fact({ batchSize: null });
        const rows = (n: number): unknown => [
            { Plan: { 'Node Type': 'Seq Scan', 'Plan Rows': n } },
        ];
        const verdict = verifyPlanDescribesSameWork(
            candidate,
            candidate.backfill?.planSql ?? '',
            rows(1270),
            rows(1),
        );
        assert.strictEqual(verdict.ok, false);
        if (verdict.ok) return;
        assert.strictEqual(verdict.reason, 'plan-describes-less-work');
    });

    await test('a batched plan is compared against its batch, not the whole table', () => {
        const rows = (n: number): unknown => [
            { Plan: { 'Node Type': 'Seq Scan', 'Plan Rows': n } },
        ];
        // batchSize 1000, estimate 1270 -> planning 1000 rows is correct
        assert.strictEqual(
            verifyPlanDescribesSameWork(
                fact(),
                fact().backfill?.planSql ?? '',
                rows(1270),
                rows(1000),
            ).ok,
            true,
        );
        // an unbatched plan matching the estimate is fine
        assert.strictEqual(
            verifyPlanDescribesSameWork(
                fact({ batchSize: null }),
                fact().backfill?.planSql ?? '',
                rows(1270),
                rows(1270),
            ).ok,
            true,
        );
    });

    await test('an estimate that counts rather than enumerates is rejected', () => {
        const candidate = fact();
        const verdict = verifyEstimateEnumeratesRows(
            candidate,
            'SELECT count(*) FROM widgets',
            explain({ 'Node Type': 'Aggregate', 'Plan Rows': 1 }),
        );
        assert.strictEqual(verdict.ok, false);
        if (verdict.ok) return;
        assert.strictEqual(verdict.reason, 'estimate-aggregates-rows');
        assert.strictEqual(
            verifyEstimateEnumeratesRows(
                candidate,
                'SELECT widget_id FROM widgets',
                explain({ 'Node Type': 'Seq Scan', 'Plan Rows': 1264 }),
            ).ok,
            true,
        );
    });

    await test('a corpus with no backfill SQL reports zero verified, not silent success', () => {
        const summary = summarizeVerdicts(
            Array.from({ length: 397 }, () => ({ ok: true, verified: false })),
        );
        assert.deepStrictEqual(summary, {
            total: 397,
            verified: 0,
            skipped: 397,
            unverifiable: 0,
            failed: 0,
        });
        assert.match(summaryLine(summary), /0 verified against a database/);
    });

    await test('a fact whose schema cannot be rebuilt is unverifiable, not verified and not failed', () => {
        const summary = summarizeVerdicts([
            { ok: true, verified: true },
            { ok: true, verified: false, unverifiable: true },
            { ok: true, verified: false },
        ]);
        assert.deepStrictEqual(summary, {
            total: 3,
            verified: 1,
            skipped: 1,
            unverifiable: 1,
            failed: 0,
        });
        assert.strictEqual(nothingVerifiedError(summary), null);
        assert.match(summaryLine(summary), /1 unverifiable/);
    });

    await test('a corpus that is entirely unverifiable does not satisfy --require-verified', () => {
        const summary = summarizeVerdicts([
            { ok: true, verified: false, unverifiable: true },
        ]);
        assert.notStrictEqual(nothingVerifiedError(summary), null);
    });

    await test('--require-verified fails a run that checked nothing against a database', () => {
        const nothingChecked = summarizeVerdicts([
            { ok: true, verified: false },
        ]);
        assert.notStrictEqual(nothingVerifiedError(nothingChecked), null);
        const somethingChecked = summarizeVerdicts([
            { ok: true, verified: false },
            { ok: true, verified: true },
        ]);
        assert.strictEqual(nothingVerifiedError(somethingChecked), null);
    });

    await test('the summary counts failures alongside what was verified', () => {
        assert.deepStrictEqual(
            summarizeVerdicts([
                { ok: true, verified: true },
                { ok: false, verified: true },
                { ok: true, verified: false },
            ]),
            { total: 3, verified: 2, skipped: 1, unverifiable: 0, failed: 1 },
        );
    });

    if (passed + failures.length === 0) {
        console.error('verify-migration-facts: no tests ran');
        process.exitCode = 1;
        return;
    }

    if (failures.length > 0) {
        console.error(failures.join('\n'));
        process.exitCode = 1;
    } else {
        console.log(`verify-migration-facts: ${passed} tests passed`);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
