/**
 * Unit tests for the PURE core of the SPK-701 preflight prober.
 * Run: `npx tsx scripts/preflight.test.ts`
 *
 * The psql IO shell is exercised manually against a dev instance (see the
 * spike write-up); everything here runs on fixtures.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    ActivityRow,
    assertSafeApiBaseUrl,
    executionSeconds,
    parseNumericFlag,
    formatSeconds,
    makePsqlRunner,
    analyzeActivity,
    analyzeLock,
    analyzeRowEstimate,
    analyzeSeqScans,
    analyzeWriteRates,
    buildReport,
    computeWriteRates,
    Finding,
    flattenPlan,
    MigrationFact,
    parseFactsFile,
    selectFacts,
    StatRow,
    topPlanRows,
} from './preflight';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed += 1;
    } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

const fact = (overrides: Partial<MigrationFact> = {}): MigrationFact => ({
    migration: '20260101000000_test_migration',
    introducedIn: '1.50.0',
    runsInTransaction: true,
    resumable: false,
    batchSize: null,
    lockTimeout: null,
    tables: [{ name: 'users', access: ['write'], expectedLockModes: ['RowExclusiveLock'] }],
    backfill: {
        description: 'test',
        estimateSql: 'SELECT user_id FROM users WHERE is_setup_complete = false',
        planSql: null,
        supportingIndexSql: null,
    },
    notes: null,
    ...overrides,
});

const explainFixture = (planRows: number, relation = 'users') => [
    {
        Plan: {
            'Node Type': 'Seq Scan',
            'Relation Name': relation,
            'Plan Rows': planRows,
        },
    },
];

// --- parseFactsFile ----------------------------------------------------------

const validFactsFile = (facts: MigrationFact[]): string =>
    JSON.stringify({ schemaVersion: '1-draft', migrationFacts: facts });

test('parseFactsFile rejects a file without migrationFacts', () => {
    assert.throws(() => parseFactsFile('{"schemaVersion":"1-draft"}'), /migrationFacts/);
});

test('the shipped example facts file validates against the schema', () => {
    const raw = fs.readFileSync(
        path.join(__dirname, 'preflight-facts.example.json'),
        'utf-8',
    );
    assert.strictEqual(parseFactsFile(raw).migrationFacts.length, 3);
});

test('schema rejects an unknown table access value', () => {
    const bad = fact({
        tables: [{ name: 'users', access: ['readwrite' as never], expectedLockModes: [] }],
    });
    assert.throws(() => parseFactsFile(validFactsFile([bad])), /not in enum/);
});

test('schema rejects unknown properties on a fact', () => {
    const bad = { ...fact(), surprise: true } as unknown as MigrationFact;
    assert.throws(() => parseFactsFile(validFactsFile([bad])), /additional property not allowed/);
});

test('schema rejects a wrong schemaVersion', () => {
    assert.throws(
        () => parseFactsFile('{"schemaVersion":"2","migrationFacts":[]}'),
        /does not equal const/,
    );
});

test('parseFactsFile rejects multi-statement backfill SQL', () => {
    const file = JSON.stringify({
        schemaVersion: '1-draft',
        migrationFacts: [
            {
                ...fact(),
                backfill: {
                    description: 'x',
                    estimateSql: 'SELECT 1; COMMIT; DROP TABLE users',
                    planSql: null,
                    supportingIndexSql: null,
                },
            },
        ],
    });
    assert.throws(() => parseFactsFile(file), /single statement/);
});

test('parseFactsFile rejects a fact without a version', () => {
    assert.throws(
        () => parseFactsFile('{"migrationFacts":[{"migration":"x"}]}'),
        /introducedIn/,
    );
});

// --- selectFacts -------------------------------------------------------------

test('selectFacts takes migrations strictly after from, up to and including to', () => {
    const facts = [
        fact({ migration: 'a', introducedIn: '1.50.0' }),
        fact({ migration: 'b', introducedIn: '1.51.0' }),
        fact({ migration: 'c', introducedIn: '1.60.0' }),
        fact({ migration: 'd', introducedIn: '1.61.0' }),
    ];
    assert.deepStrictEqual(
        selectFacts(facts, '1.50.0', '1.60.0').map((f) => f.migration),
        ['b', 'c'],
    );
});

test('selectFacts orders versions numerically, not lexically', () => {
    const facts = [fact({ migration: 'a', introducedIn: '0.3477.0' })];
    assert.strictEqual(selectFacts(facts, '0.3476.2', '0.3480.0').length, 1);
    assert.strictEqual(selectFacts(facts, '0.3477.0', '0.3480.0').length, 0);
});

// --- analyzeLock -------------------------------------------------------------

test('free lock is ok', () => {
    const f = analyzeLock([{ index: 1, is_locked: 0 }], 0);
    assert.strictEqual(f.severity, 'ok');
});

test('held lock with no migration backend is a stale-lock blocker with a clear action', () => {
    const f = analyzeLock([{ index: 1, is_locked: 1 }], 0);
    assert.strictEqual(f.severity, 'blocker');
    assert.match(f.action ?? '', /UPDATE knex_migrations_lock SET is_locked = 0/);
});

test('held lock with an active migration backend reports a live run, not a stale lock', () => {
    const f = analyzeLock([{ index: 1, is_locked: 1 }], 1);
    assert.strictEqual(f.severity, 'blocker');
    assert.match(f.summary, /active migration/);
});

test('missing lock table degrades to a warning', () => {
    assert.strictEqual(analyzeLock(null, 0).severity, 'warn');
});

// --- computeWriteRates -------------------------------------------------------

const stat = (over: Partial<StatRow>): StatRow => ({
    relname: 'users',
    n_tup_ins: 0,
    n_tup_upd: 0,
    n_tup_del: 0,
    n_live_tup: 1000,
    ...over,
});

test('write rate is the summed counter delta scaled to rows/min', () => {
    const rates = computeWriteRates(
        [stat({ n_tup_ins: 100, n_tup_upd: 50 })],
        [stat({ n_tup_ins: 160, n_tup_upd: 70 })],
        30,
    );
    assert.strictEqual(rates[0].rowsPerMin, 160); // 80 rows in 30s
});

test('a stats reset (counters going backwards) clamps to zero instead of negative', () => {
    const rates = computeWriteRates(
        [stat({ n_tup_ins: 5000 })],
        [stat({ n_tup_ins: 10 })],
        10,
    );
    assert.strictEqual(rates[0].rowsPerMin, 0);
});

test('a table absent from the first sample reports zero rate, not NaN', () => {
    const rates = computeWriteRates([], [stat({ n_tup_ins: 100 })], 10);
    assert.strictEqual(rates[0].rowsPerMin, 0);
});

// --- analyzeWriteRates -------------------------------------------------------

test('busy mutated table warns with a pause action; quiet table is ok', () => {
    const findings = analyzeWriteRates(
        [fact()],
        [
            {
                table: 'users',
                rowsPerMin: 500,
                inserts: 100,
                updates: 0,
                deletes: 0,
                liveTuples: 2_000_000,
            },
        ],
        10,
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, 'warn');
    assert.match(findings[0].action ?? '', /pause/i);
});

test('read-only joined tables are not rated', () => {
    const f = fact({
        tables: [{ name: 'projects', access: ['read'], expectedLockModes: [] }],
    });
    assert.strictEqual(analyzeWriteRates([f], [], 10).length, 0);
});

test('a mutated table missing from pg_stat warns about schema drift', () => {
    const findings = analyzeWriteRates([fact()], [], 10);
    assert.strictEqual(findings[0].severity, 'warn');
    assert.match(findings[0].summary, /not found/);
});

// --- EXPLAIN analysis --------------------------------------------------------

test('topPlanRows reads the top plan node estimate', () => {
    assert.strictEqual(topPlanRows(explainFixture(123456)), 123456);
    assert.strictEqual(topPlanRows({ not: 'a plan' }), null);
});

test('flattenPlan walks nested plans', () => {
    const nested = {
        'Node Type': 'Limit',
        Plans: [
            {
                'Node Type': 'Hash Join',
                Plans: [
                    { 'Node Type': 'Seq Scan', 'Relation Name': 'saved_queries' },
                    { 'Node Type': 'Index Scan', 'Relation Name': 'spaces' },
                ],
            },
        ],
    };
    assert.strictEqual(flattenPlan(nested).length, 4);
});

test('large single-transaction backfill warns; batched resumable one is ok', () => {
    const single = analyzeRowEstimate(fact(), explainFixture(2_000_000), 100000, null);
    assert.strictEqual(single.severity, 'warn');
    assert.match(single.summary, /2,000,000 rows/);

    const batched = analyzeRowEstimate(
        fact({ runsInTransaction: false, resumable: true, batchSize: 1000 }),
        explainFixture(2_000_000),
        100000,
        null,
    );
    assert.strictEqual(batched.severity, 'ok');
    assert.match(batched.summary, /batches of 1000, resumable \(~2,000 passes\)/);
});

test('a measured scan turns the window advice into a number and names the k8s knobs', () => {
    const slow = analyzeRowEstimate(fact(), explainFixture(2_000_000), 100000, 300);
    assert.match(slow.summary, /measured ~5 min on this instance/);
    assert.match(slow.action ?? '', /window of at least ~5 min/);
    assert.match(slow.action ?? '', /recommendedStrategy \(Recreate/);
    assert.match(slow.action ?? '', /activeDeadlineSeconds/);

    const fast = analyzeRowEstimate(fact(), explainFixture(2_000_000), 100000, 0.4);
    assert.doesNotMatch(fast.action ?? '', /at least <1s/);
    assert.match(fast.action ?? '', /scan measured <1s here, but the single-transaction UPDATE/);
});

test('formatSeconds picks sensible units', () => {
    assert.strictEqual(formatSeconds(0.3), '<1s');
    assert.strictEqual(formatSeconds(45), '~45s');
    assert.strictEqual(formatSeconds(300), '~5 min');
});

test('executionSeconds reads EXPLAIN ANALYZE output', () => {
    assert.strictEqual(executionSeconds([{ 'Execution Time': 1234 }]), 1.234);
    assert.strictEqual(executionSeconds({ nope: true }), null);
});

test('seq scan on a large table warns; small table stays quiet', () => {
    const big = analyzeSeqScans(
        fact(),
        explainFixture(500, 'users'),
        new Map([['users', 2_000_000]]),
        100000,
        500,
        null,
    );
    assert.strictEqual(big.length, 1);
    assert.match(big[0].summary, /seq-scans "users"/);

    const small = analyzeSeqScans(
        fact(),
        explainFixture(500, 'users'),
        new Map([['users', 91]]),
        100000,
        500,
        null,
    );
    assert.strictEqual(small.length, 0);
});

test('predicate matching most of the table suppresses index advice — the scan is the work', () => {
    const findings = analyzeSeqScans(
        fact(),
        explainFixture(1_900_000, 'users'),
        new Map([['users', 2_000_000]]),
        100000,
        1_900_000,
        8,
    );
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0].summary, /no index can help/);
    assert.match(findings[0].summary, /~95% of "users"/);
    assert.strictEqual(findings[0].actionKind, 'plan');
    assert.doesNotMatch(findings[0].action ?? '', /index/i);
});

test('a vetted supporting index becomes a runnable remediation', () => {
    const withIndex = fact();
    (withIndex.backfill as { supportingIndexSql: string | null }).supportingIndexSql =
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x ON users (user_id) WHERE is_setup_complete = false';
    const findings = analyzeSeqScans(
        withIndex,
        explainFixture(100_000, 'users'),
        new Map([['users', 2_000_000]]),
        100000,
        100_000,
        8,
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].actionKind, 'remediate');
    assert.match(findings[0].action ?? '', /run: CREATE INDEX CONCURRENTLY/);
    assert.match(findings[0].action ?? '', /re-run preflight/);
});

// --- analyzeActivity ---------------------------------------------------------

const activity = (over: Partial<ActivityRow>): ActivityRow => ({
    pid: 4242,
    usename: 'postgres',
    application_name: 'upload-cron',
    state: 'idle in transaction',
    xact_age_s: 10,
    query: 'INSERT INTO uploads ...',
    blocked_by: null,
    ...over,
});

test('a lock wait is a blocker naming the blocking pids', () => {
    const findings = analyzeActivity([activity({ blocked_by: [99] })], 300);
    assert.strictEqual(findings[0].severity, 'blocker');
    assert.match(findings[0].summary, /pid\(s\) 99/);
});

test('a long-open transaction warns; short ones do not', () => {
    const long = analyzeActivity([activity({ xact_age_s: 1800 })], 300);
    assert.strictEqual(long[0].severity, 'warn');
    assert.match(long[0].summary, /30 min/);

    const short = analyzeActivity([activity({ xact_age_s: 5 })], 300);
    assert.strictEqual(short[0].severity, 'ok');
});

// --- buildReport -------------------------------------------------------------

test('report sorts blockers first, splits actions by kind, and aggregates the verdict', () => {
    const findings: Finding[] = [
        { check: 'write-rate', severity: 'ok', migration: null, table: 'users', summary: 'quiet', action: null, actionKind: null, data: {} },
        { check: 'row-estimate', severity: 'warn', migration: null, table: 'users', summary: 'huge', action: 'plan a window', actionKind: 'plan', data: {} },
        { check: 'write-rate', severity: 'warn', migration: null, table: 'users', summary: 'busy', action: 'pause the writer', actionKind: 'remediate', data: {} },
        { check: 'stale-lock', severity: 'blocker', migration: null, table: null, summary: 'stale', action: 'clear the lock', actionKind: 'remediate', data: {} },
    ];
    const report = buildReport('1.50.0', '1.60.0', [fact()], findings);
    assert.strictEqual(report.verdict, 'blocker');
    assert.deepStrictEqual(report.remediateNow, ['clear the lock', 'pause the writer']);
    assert.deepStrictEqual(report.planItems, ['plan a window']);
    assert.strictEqual(report.findings[0].check, 'stale-lock');
});

test('all-ok findings give an ok verdict and empty remediation/plan lists', () => {
    const report = buildReport('1.50.0', '1.60.0', [], [
        { check: 'activity', severity: 'ok', migration: null, table: null, summary: 'fine', action: null, actionKind: null, data: {} },
    ]);
    assert.strictEqual(report.verdict, 'ok');
    assert.deepStrictEqual(report.remediateNow, []);
    assert.deepStrictEqual(report.planItems, []);
});

test('operator-fixable findings are remediate; migration-intrinsic ones are plan', () => {
    assert.strictEqual(analyzeLock([{ index: 1, is_locked: 1 }], 0).actionKind, 'remediate');
    const busy = analyzeWriteRates(
        [fact()],
        [{ table: 'users', rowsPerMin: 500, inserts: 100, updates: 0, deletes: 0, liveTuples: 2_000_000 }],
        10,
    );
    assert.strictEqual(busy[0].actionKind, 'remediate');
    const longTxn = analyzeActivity([activity({ xact_age_s: 1800 })], 300);
    assert.strictEqual(longTxn[0].actionKind, 'remediate');

    const bigTxn = analyzeRowEstimate(fact(), explainFixture(2_000_000), 100000, null);
    assert.strictEqual(bigTxn.actionKind, 'plan');
    assert.match(bigTxn.action ?? '', /Recreate/);
    assert.match(bigTxn.action ?? '', /eviction/);
    const seq = analyzeSeqScans(fact(), explainFixture(500, 'users'), new Map([['users', 2_000_000]]), 100000, 500, null);
    assert.strictEqual(seq[0].actionKind, 'plan');
});

// --- transport guards --------------------------------------------------------

test('http API URLs are rejected unless local or explicitly allowed', () => {
    assert.throws(() => assertSafeApiBaseUrl('http://lightdash.internal:8080', false), /cleartext/);
    assert.doesNotThrow(() => assertSafeApiBaseUrl('http://localhost:8120', false));
    assert.doesNotThrow(() => assertSafeApiBaseUrl('http://lightdash.internal:8080', true));
    assert.doesNotThrow(() => assertSafeApiBaseUrl('https://lightdash.example.com', false));
    assert.throws(() => assertSafeApiBaseUrl('not a url', false), /not a valid URL/);
});

test('malformed numeric flags fail loudly instead of producing a false clear verdict', () => {
    assert.strictEqual(parseNumericFlag('--interval', null, 10), 10);
    assert.strictEqual(parseNumericFlag('--interval', '15', 10), 15);
    assert.throws(() => parseNumericFlag('--interval', 'abc', 10), /positive number/);
    assert.throws(() => parseNumericFlag('--interval', '-5', 10), /positive number/);
    assert.throws(() => parseNumericFlag('--interval', '0', 10), /positive number/);
});

test('quoted --psql commands fail loudly instead of splitting silently', () => {
    assert.throws(() => makePsqlRunner('psql "dbname=my db"'), /does not understand quoting/);
    assert.doesNotThrow(() => makePsqlRunner('docker exec db psql -U postgres'));
});

// -----------------------------------------------------------------------------

if (failures.length > 0) {
    console.error(`${failures.length} test(s) failed:`);
    for (const failure of failures) console.error(`  ✖ ${failure}`);
    process.exit(1);
}
console.log(`preflight: ${passed} tests passed`);
