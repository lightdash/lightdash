/**
 * SPK-701 SPIKE — upgrade preflight prober.
 *
 * Joins per-migration facts (a draft `migrationFacts` extension of the
 * release-safety marker, hand-authored fixtures for now) with read-only
 * queries against the operator's Postgres, and emits a concrete operator
 * plan for the upgrade window instead of a bare verdict.
 *
 * Checks:
 *   - held `knex_migrations_lock` row (blocks every future migration run)
 *   - write rate on tables the selected migrations write/DDL, from two
 *     samples of pg_stat_user_tables
 *   - per-backfill row estimates via EXPLAIN (FORMAT JSON) — never COUNT(*)
 *   - plan shape: seq scans on large tables in the backfill query
 *   - long-running transactions and lock waits in pg_stat_activity
 *
 * PURE core (fact selection, analysis, report building) + thin IO shell that
 * shells out to psql (`--psql` makes the transport configurable; every query
 * runs inside BEGIN TRANSACTION READ ONLY). Prototype: NOT wired into the CLI
 * package — delivery form is the open design question this spike informs.
 *
 * Run:
 *   npx tsx scripts/preflight.ts --facts <facts.json> --from 1.50.0 --to 1.60.0 \
 *     [--psql "psql -h host -U user -d db"] [--interval 10] [--probe-timeout 30] [--measure] [--json]
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
    analyzeActivity,
    analyzeLock,
    analyzeLockTimeouts,
    analyzeRowEstimate,
    analyzeSeqScans,
    analyzeUpgradeStrategy,
    analyzeWriteRates,
    buildReport,
    computeWriteRates,
    executionSeconds,
    findRangeGaps,
    mergeFactsFiles,
    parseFactsFile,
    renderHuman,
    selectFacts,
    type ActivityRow,
    type Finding,
    type LockRow,
    type MigrationFact,
    type StatRow,
} from '@lightdash/common';

export {
    analyzeActivity,
    analyzeLock,
    analyzeLockTimeouts,
    analyzeRowEstimate,
    analyzeSeqScans,
    analyzeUpgradeStrategy,
    analyzeWriteRates,
    buildReport,
    computeWriteRates,
    coverageFinding,
    enterpriseCoverageFinding,
    executionSeconds,
    findRangeGaps,
    flattenPlan,
    formatSeconds,
    mergeFactsFiles,
    parseFactsFile,
    renderHuman,
    selectFacts,
    topPlanRows,
    type ActionKind,
    type ActivityRow,
    type BackfillFact,
    type FactsCoverage,
    type FactsFile,
    type FactsRangeCoverage,
    type Finding,
    type LockRow,
    type MergedFactsFile,
    type MigrationFact,
    type PlanNode,
    type PreflightReport,
    type Severity,
    type StatRow,
    type TableAccess,
    type TableFact,
    type WriteRate,
} from '@lightdash/common';

// --- IO shell -----------------------------------------------------------------

interface ApiProbe {
    serverTime: string;
    lock: { isLocked: boolean; lastMigrationAgeSeconds: number | null } | null;
    tableStats: Array<{
        table: string;
        inserts: number;
        updates: number;
        deletes: number;
        liveTuples: number;
    }>;
    activity: Array<{
        pid: number;
        userName: string | null;
        applicationName: string | null;
        state: string | null;
        xactAgeSeconds: number | null;
        query: string | null;
        blockedBy: number[];
    }>;
}

export function assertSafeApiBaseUrl(baseUrl: string, allowInsecure: boolean): void {
    let parsed: URL;
    try {
        parsed = new URL(baseUrl);
    } catch {
        throw new Error(`--api is not a valid URL: ${baseUrl}`);
    }
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocal && !allowInsecure) {
        throw new Error(
            `--api uses ${parsed.protocol}// — the API key would travel in cleartext. Use https, or pass --allow-insecure if you accept that`,
        );
    }
}

async function fetchApiProbe(
    baseUrl: string,
    apiKey: string,
    tables: string[],
): Promise<ApiProbe> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/preflight/probe?tables=${encodeURIComponent(tables.join(','))}`;
    const response = await fetch(url, {
        headers: { Authorization: `ApiKey ${apiKey}` },
    });
    if (!response.ok) {
        throw new Error(`probe endpoint returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const body = (await response.json()) as { status: string; results: ApiProbe };
    return body.results;
}

const statRowsFromProbe = (probe: ApiProbe): StatRow[] =>
    probe.tableStats.map((t) => ({
        relname: t.table,
        n_tup_ins: t.inserts,
        n_tup_upd: t.updates,
        n_tup_del: t.deletes,
        n_live_tup: t.liveTuples,
    }));

const activityRowsFromProbe = (probe: ApiProbe): ActivityRow[] =>
    probe.activity.map((a) => ({
        pid: a.pid,
        usename: a.userName,
        application_name: a.applicationName,
        state: a.state,
        xact_age_s: a.xactAgeSeconds,
        query: a.query,
        blocked_by: a.blockedBy.length > 0 ? a.blockedBy : null,
    }));

interface PsqlRunner {
    json: (sql: string) => unknown;
    explain: (sql: string) => unknown;
    explainAnalyze: (sql: string) => unknown;
}

export function buildReadOnlyPsqlPayload(
    sql: string,
    statementTimeoutSeconds: number,
): string {
    return `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '${statementTimeoutSeconds}s'; ${sql}; ROLLBACK;`;
}

export function makePsqlRunner(
    psqlCommand: string,
    statementTimeoutSeconds = 30,
): PsqlRunner {
    if (/['"\\]/.test(psqlCommand)) {
        throw new Error(
            '--psql is split on whitespace and does not understand quoting — pass a bare executable plus simple flags (quotes/backslashes would be passed through literally)',
        );
    }
    const argv = psqlCommand.split(/\s+/).filter(Boolean);
    const run = (payload: string): string =>
        execFileSync(argv[0], [...argv.slice(1), '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', payload], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    const readOnly = (sql: string): string =>
        buildReadOnlyPsqlPayload(sql, statementTimeoutSeconds);
    return {
        json: (sql: string) => {
            const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (${sql}) AS t`;
            return JSON.parse(run(readOnly(wrapped)).trim());
        },
        explain: (sql: string) => JSON.parse(run(readOnly(`EXPLAIN (FORMAT JSON) ${sql}`)).trim()),
        explainAnalyze: (sql: string) =>
            JSON.parse(run(readOnly(`EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${sql}`)).trim()),
    };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface CliArgs {
    factsPaths: string[];
    from: string;
    to: string;
    psql: string;
    intervalSeconds: number;
    json: boolean;
    writeRateThreshold: number;
    largeRowThreshold: number;
    longTxnThresholdSeconds: number;
    probeTimeoutSeconds: number;
    measure: boolean;
    api: string | null;
    allowInsecure: boolean;
}

export function parseNumericFlag(
    name: string,
    raw: string | null,
    fallback: number,
): number {
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number, got "${raw}"`);
    }
    return value;
}

export function parseIntegerFlag(
    name: string,
    raw: string | null,
    fallback: number,
): number {
    const value = parseNumericFlag(name, raw, fallback);
    if (!Number.isInteger(value)) {
        throw new Error(`${name} must be a positive integer, got "${raw}"`);
    }
    return value;
}

export function parseArgs(argv: string[]): CliArgs {
    const get = (flag: string): string | null => {
        const i = argv.indexOf(flag);
        const value = i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
        return value !== null && value.startsWith('--') ? null : value;
    };
    const getAll = (flag: string): string[] => {
        const values: string[] = [];
        argv.forEach((arg, i) => {
            const value = arg === flag && i + 1 < argv.length ? argv[i + 1] : null;
            if (value !== null && !value.startsWith('--')) values.push(value);
        });
        return values;
    };
    const factsPaths = getAll('--facts');
    const from = get('--from');
    const to = get('--to');
    if (factsPaths.length === 0 || !from || !to) {
        throw new Error(
            'usage: preflight.ts --facts <file> [--facts <file> ...] --from <current version> --to <target version> [--psql "<cmd>" | --api <baseUrl>] [--interval <s>] [--probe-timeout <s>] [--measure] [--json]',
        );
    }
    return {
        factsPaths,
        from,
        to,
        psql: get('--psql') ?? 'psql',
        intervalSeconds: parseNumericFlag('--interval', get('--interval'), 10),
        json: argv.includes('--json'),
        writeRateThreshold: parseNumericFlag(
            '--write-rate-threshold',
            get('--write-rate-threshold'),
            10,
        ),
        largeRowThreshold: parseNumericFlag(
            '--large-row-threshold',
            get('--large-row-threshold'),
            100000,
        ),
        longTxnThresholdSeconds: parseNumericFlag(
            '--long-txn-threshold',
            get('--long-txn-threshold'),
            300,
        ),
        probeTimeoutSeconds: parseIntegerFlag(
            '--probe-timeout',
            get('--probe-timeout'),
            30,
        ),
        measure: argv.includes('--measure'),
        api: get('--api'),
        allowInsecure: argv.includes('--allow-insecure'),
    };
}

async function runApiMode(args: CliArgs, facts: MigrationFact[]): Promise<Finding[]> {
    const apiKey = process.env.LIGHTDASH_API_KEY;
    if (!apiKey) {
        throw new Error('--api mode needs LIGHTDASH_API_KEY in the environment');
    }
    const baseUrl = args.api as string;
    assertSafeApiBaseUrl(baseUrl, args.allowInsecure);
    const findings: Finding[] = [];
    const tableNames = [...new Set(facts.flatMap((f) => f.tables.map((t) => t.name)))];

    const before = await fetchApiProbe(baseUrl, apiKey, tableNames);
    process.stderr.write(
        `[preflight] sampling write activity via ${baseUrl} for ${args.intervalSeconds}s across ${tableNames.length} table(s)...\n`,
    );
    await sleep(args.intervalSeconds * 1000);
    const after = await fetchApiProbe(baseUrl, apiKey, tableNames);

    const lockRows: LockRow[] | null = after.lock
        ? [{ index: 1, is_locked: after.lock.isLocked ? 1 : 0 }]
        : null;
    findings.push(analyzeLock(lockRows, after.lock?.lastMigrationAgeSeconds ?? null));

    const rates = computeWriteRates(
        statRowsFromProbe(before),
        statRowsFromProbe(after),
        args.intervalSeconds,
    );
    findings.push(...analyzeWriteRates(facts, rates, args.writeRateThreshold));
    findings.push(
        ...analyzeLockTimeouts(
            facts,
            new Map(rates.map((rate) => [rate.table, rate.liveTuples])),
            args.largeRowThreshold,
        ),
    );

    findings.push(...analyzeActivity(activityRowsFromProbe(after), args.longTxnThresholdSeconds));

    findings.push(...analyzeUpgradeStrategy(facts));

    const skipped = facts.filter((f) => f.backfill !== null);
    if (skipped.length > 0) {
        findings.push({
            check: 'row-estimate',
            severity: 'warn',
            migration: null,
            table: null,
            summary: `EXPLAIN-based checks (row estimates and index/plan shape${args.measure ? ', including requested duration measurements' : ''}) skipped in API mode for ${skipped.length} backfill(s) — they need facts SQL executed against the database, which this endpoint deliberately does not do`,
            action: 'run preflight with direct database access for full coverage, or wait for server-side verified-facts probing (open design question)',
            actionKind: 'plan',
            data: { skippedMigrations: skipped.map((f) => f.migration) },
        });
    }
    return findings;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const factsFiles = args.factsPaths.map((factsPath) =>
        parseFactsFile(fs.readFileSync(factsPath, 'utf-8')),
    );
    const factsFile = mergeFactsFiles(factsFiles);
    const rangeCoverage = findRangeGaps(factsFiles, args.from, args.to);
    const facts = selectFacts(factsFile.migrationFacts, args.from, args.to);

    if (args.api !== null) {
        const apiFindings = await runApiMode(args, facts);
        const apiReport = buildReport(
            args.from,
            args.to,
            facts,
            apiFindings,
            factsFile,
            rangeCoverage,
            factsFile.enterpriseMigrationsWithoutFacts,
        );
        console.log(args.json ? JSON.stringify(apiReport, null, 2) : renderHuman(apiReport));
        process.exit(apiReport.verdict === 'blocker' ? 2 : apiReport.verdict === 'warn' ? 1 : 0);
    }

    const db = makePsqlRunner(args.psql, args.probeTimeoutSeconds);
    const findings: Finding[] = [];

    let lockRows: LockRow[] | null;
    try {
        lockRows = db.json('SELECT "index", is_locked FROM knex_migrations_lock') as LockRow[];
    } catch {
        lockRows = null;
    }
    let lastMigrationAgeSeconds: number | null = null;
    if (lockRows?.some((row) => Number(row.is_locked) === 1)) {
        try {
            const lastMigration = db.json(
                'SELECT EXTRACT(EPOCH FROM now() - max(migration_time))::integer AS age_seconds FROM knex_migrations',
            ) as Array<{ age_seconds: number | null }>;
            lastMigrationAgeSeconds = lastMigration[0]?.age_seconds ?? null;
        } catch {
            lastMigrationAgeSeconds = null;
        }
    }
    findings.push(analyzeLock(lockRows, lastMigrationAgeSeconds));
    findings.push(...analyzeUpgradeStrategy(facts));

    const tableNames = [
        ...new Set(facts.flatMap((f) => f.tables.map((t) => t.name))),
    ];
    let liveTuplesByTable = new Map<string, number>();
    if (tableNames.length > 0) {
        const quoted = tableNames.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
        const statSql = `SELECT relname, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup FROM pg_stat_user_tables WHERE schemaname = current_schema() AND relname IN (${quoted})`;
        const before = db.json(statSql) as StatRow[];
        process.stderr.write(
            `[preflight] sampling write activity for ${args.intervalSeconds}s across ${tableNames.length} table(s)...\n`,
        );
        await sleep(args.intervalSeconds * 1000);
        const after = db.json(statSql) as StatRow[];
        const rates = computeWriteRates(before, after, args.intervalSeconds);
        liveTuplesByTable = new Map(rates.map((r) => [r.table, r.liveTuples]));
        findings.push(...analyzeWriteRates(facts, rates, args.writeRateThreshold));
    }
    findings.push(
        ...analyzeLockTimeouts(facts, liveTuplesByTable, args.largeRowThreshold),
    );

    for (const fact of facts) {
        if (!fact.backfill) continue;
        try {
            const estimate = db.explain(fact.backfill.estimateSql);
            let scanSeconds: number | null = null;
            if (args.measure) {
                try {
                    scanSeconds = executionSeconds(db.explainAnalyze(fact.backfill.estimateSql));
                } catch {
                    scanSeconds = null;
                }
            }
            const writtenTable = fact.tables.find((table) =>
                table.access.includes('write'),
            )?.name;
            findings.push(
                analyzeRowEstimate(
                    fact,
                    estimate,
                    writtenTable ? (liveTuplesByTable.get(writtenTable) ?? 0) : 0,
                    args.largeRowThreshold,
                    scanSeconds,
                ),
            );
            const planJson = fact.backfill.planSql
                ? db.explain(fact.backfill.planSql)
                : estimate;
            findings.push(
                ...analyzeSeqScans(
                    fact,
                    planJson,
                    liveTuplesByTable,
                    args.largeRowThreshold,
                    scanSeconds,
                ),
            );
        } catch (err) {
            findings.push({
                check: 'row-estimate',
                severity: 'warn',
                migration: fact.migration,
                table: null,
                summary: `backfill estimate query failed for "${fact.migration}" — facts may not match this schema version: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
                action: null,
                actionKind: null,
                data: {},
            });
        }
    }

    const activity = db.json(
        `SELECT pid, usename, application_name, state,
                EXTRACT(EPOCH FROM now() - xact_start)::integer AS xact_age_s,
                left(query, 160) AS query,
                CASE WHEN cardinality(pg_blocking_pids(pid)) > 0 THEN pg_blocking_pids(pid) END AS blocked_by
         FROM pg_stat_activity
         WHERE pid <> pg_backend_pid() AND xact_start IS NOT NULL AND state <> 'idle'`,
    ) as ActivityRow[];
    findings.push(...analyzeActivity(activity, args.longTxnThresholdSeconds));

    const report = buildReport(
        args.from,
        args.to,
        facts,
        findings,
        factsFile,
        rangeCoverage,
        factsFile.enterpriseMigrationsWithoutFacts,
    );
    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderHuman(report));
    }
    process.exit(report.verdict === 'blocker' ? 2 : report.verdict === 'warn' ? 1 : 0);
}

const isCliInvocation =
    require.main === module || process.argv[1]?.endsWith('preflight.ts') === true;

if (isCliInvocation) {
    main().catch((err) => {
        console.error(`[preflight] FAILED: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(3);
    });
}
