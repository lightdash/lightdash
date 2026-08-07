/**
 * SPK-701 SPIKE — upgrade preflight prober.
 *
 * Joins per-migration facts (a draft `migrationFacts` extension of the
 * release-safety marker, hand-authored fixtures for now) with read-only
 * queries against the operator's Postgres, and emits a concrete operator
 * plan for the upgrade window instead of a bare verdict.
 *
 * Checks:
 *   - stale `knex_migrations_lock` row (blocks every future migration run)
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
 *     [--psql "psql -h host -U user -d db"] [--interval 10] [--json]
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { compareVersions } from './expand-version';
import { validateAgainstSchema } from './json-schema-lite';

// --- facts (draft migrationFacts schema) ------------------------------------

export type TableAccess = 'read' | 'write' | 'ddl';

export interface TableFact {
    name: string;
    access: TableAccess[];
    expectedLockModes: string[];
}

export interface BackfillFact {
    description: string;
    /** SELECT enumerating the rows the backfill touches; MUST be runnable against the PRE-upgrade schema */
    estimateSql: string;
    /** the batch query shape for plan/index analysis (pre-upgrade-runnable); null when estimateSql is the shape */
    planSql: string | null;
    /** vetted pre-upgrade index DDL (CREATE INDEX CONCURRENTLY ...) that supports the backfill predicate; null when no index helps */
    supportingIndexSql: string | null;
}

export interface MigrationFact {
    migration: string;
    introducedIn: string;
    runsInTransaction: boolean;
    resumable: boolean;
    batchSize: number | null;
    lockTimeout: string | null;
    tables: TableFact[];
    backfill: BackfillFact | null;
    notes: string | null;
}

export interface FactsFile {
    schemaVersion: string;
    migrationFacts: MigrationFact[];
}

export const FACTS_SCHEMA_PATH = path.join(__dirname, 'preflight-facts.schema.json');

export function parseFactsFile(raw: string): FactsFile {
    const parsed = JSON.parse(raw) as unknown;
    const schema = JSON.parse(fs.readFileSync(FACTS_SCHEMA_PATH, 'utf-8')) as Record<
        string,
        unknown
    >;
    const schemaErrors = validateAgainstSchema(parsed, schema);
    if (schemaErrors.length > 0) {
        throw new Error(`facts file does not match its schema:\n  ${schemaErrors.join('\n  ')}`);
    }
    const factsFile = parsed as FactsFile;
    for (const fact of factsFile.migrationFacts) {
        for (const sql of [fact.backfill?.estimateSql, fact.backfill?.planSql]) {
            if (sql !== null && sql !== undefined && sql.includes(';')) {
                throw new Error(
                    `backfill SQL for "${fact.migration}" contains ';' — facts SQL must be a single statement (it runs inside a READ ONLY transaction and must not be able to end it)`,
                );
            }
        }
    }
    return factsFile;
}

/** migrations the upgrade will run: introduced after `from`, at or before `to` */
export function selectFacts(
    facts: MigrationFact[],
    from: string,
    to: string,
): MigrationFact[] {
    return facts.filter(
        (f) =>
            compareVersions(f.introducedIn, from) > 0 &&
            compareVersions(f.introducedIn, to) <= 0,
    );
}

// --- findings ---------------------------------------------------------------

export type Severity = 'ok' | 'info' | 'warn' | 'blocker';

/**
 * remediate — the operator can fix it in place before the upgrade and verify by
 * re-running preflight. plan — intrinsic to the migration + this database's
 * shape; cannot be fixed, only consciously planned around.
 */
export type ActionKind = 'remediate' | 'plan' | null;

export interface Finding {
    check: 'stale-lock' | 'write-rate' | 'row-estimate' | 'plan' | 'activity' | 'strategy';
    severity: Severity;
    migration: string | null;
    table: string | null;
    summary: string;
    action: string | null;
    actionKind: ActionKind;
    data: Record<string, unknown>;
}

const SEVERITY_ORDER: Record<Severity, number> = {
    blocker: 0,
    warn: 1,
    info: 2,
    ok: 3,
};

// --- stale migration lock ---------------------------------------------------

export interface LockRow {
    index: number;
    is_locked: number;
}

export function analyzeLock(
    lockRows: LockRow[] | null,
    activeMigrationBackends: number,
): Finding {
    if (lockRows === null) {
        return {
            check: 'stale-lock',
            severity: 'warn',
            migration: null,
            table: 'knex_migrations_lock',
            summary: 'knex_migrations_lock table not found — cannot verify migration lock state',
            action: null,
            actionKind: null,
            data: {},
        };
    }
    const locked = lockRows.some((r) => Number(r.is_locked) === 1);
    if (!locked) {
        return {
            check: 'stale-lock',
            severity: 'ok',
            migration: null,
            table: 'knex_migrations_lock',
            summary: 'migration lock is free',
            action: null,
            actionKind: null,
            data: { activeMigrationBackends },
        };
    }
    if (activeMigrationBackends > 0) {
        return {
            check: 'stale-lock',
            severity: 'blocker',
            migration: null,
            table: 'knex_migrations_lock',
            summary: `migration lock is held and ${activeMigrationBackends} backend(s) look like an active migration run — another upgrade may be in progress`,
            action: 'wait for the running migration to finish, then re-run preflight',
            actionKind: 'remediate',
            data: { activeMigrationBackends },
        };
    }
    return {
        check: 'stale-lock',
        severity: 'blocker',
        migration: null,
        table: 'knex_migrations_lock',
        summary:
            'migration lock is held but no backend is running migrations — stale lock from a failed/killed migration run; every future migration will fail with "Migration table is already locked"',
        action: 'run: UPDATE knex_migrations_lock SET is_locked = 0; — then re-run preflight to confirm the lock reads free',
        actionKind: 'remediate',
        data: { activeMigrationBackends },
    };
}

// --- write rate -------------------------------------------------------------

export interface StatRow {
    relname: string;
    n_tup_ins: number;
    n_tup_upd: number;
    n_tup_del: number;
    n_live_tup: number;
}

export interface WriteRate {
    table: string;
    rowsPerMin: number;
    inserts: number;
    updates: number;
    deletes: number;
    liveTuples: number;
}

export function computeWriteRates(
    before: StatRow[],
    after: StatRow[],
    intervalSeconds: number,
): WriteRate[] {
    const beforeByTable = new Map(before.map((r) => [r.relname, r]));
    return after.map((a) => {
        const b = beforeByTable.get(a.relname);
        const delta = (x: number, y: number) => Math.max(0, x - y);
        const inserts = b ? delta(Number(a.n_tup_ins), Number(b.n_tup_ins)) : 0;
        const updates = b ? delta(Number(a.n_tup_upd), Number(b.n_tup_upd)) : 0;
        const deletes = b ? delta(Number(a.n_tup_del), Number(b.n_tup_del)) : 0;
        const total = inserts + updates + deletes;
        return {
            table: a.relname,
            rowsPerMin: intervalSeconds > 0 ? Math.round((total * 60) / intervalSeconds) : 0,
            inserts,
            updates,
            deletes,
            liveTuples: Number(a.n_live_tup),
        };
    });
}

export function analyzeWriteRates(
    facts: MigrationFact[],
    rates: WriteRate[],
    thresholdRowsPerMin: number,
): Finding[] {
    const rateByTable = new Map(rates.map((r) => [r.table, r]));
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const fact of facts) {
        for (const table of fact.tables) {
            const mutating = table.access.some((a) => a === 'write' || a === 'ddl');
            if (!mutating || seen.has(table.name)) continue;
            seen.add(table.name);
            const rate = rateByTable.get(table.name);
            if (!rate) {
                findings.push({
                    check: 'write-rate',
                    severity: 'warn',
                    migration: fact.migration,
                    table: table.name,
                    summary: `table "${table.name}" not found in pg_stat_user_tables — schema drift?`,
                    action: null,
                    actionKind: null,
                    data: {},
                });
                continue;
            }
            if (rate.rowsPerMin >= thresholdRowsPerMin) {
                findings.push({
                    check: 'write-rate',
                    severity: 'warn',
                    migration: fact.migration,
                    table: table.name,
                    summary: `something is writing to "${table.name}" at ~${rate.rowsPerMin} rows/min (${rate.inserts} ins / ${rate.updates} upd / ${rate.deletes} del in the sample) while the upgrade wants ${table.access.join('+')} on it${table.expectedLockModes.length > 0 ? ` (${table.expectedLockModes.join(', ')})` : ''}`,
                    action: `pause the writer (cron/integration) on "${table.name}", then re-run preflight to confirm the table reads quiet`,
                    actionKind: 'remediate',
                    data: { rate },
                });
            } else {
                findings.push({
                    check: 'write-rate',
                    severity: 'ok',
                    migration: fact.migration,
                    table: table.name,
                    summary: `"${table.name}" is quiet (~${rate.rowsPerMin} rows/min)`,
                    action: null,
                    actionKind: null,
                    data: { rate },
                });
            }
        }
    }
    return findings;
}

// --- EXPLAIN analysis --------------------------------------------------------

interface PlanNode {
    'Node Type': string;
    'Relation Name'?: string;
    'Plan Rows'?: number;
    Plans?: PlanNode[];
}

export function flattenPlan(node: PlanNode): PlanNode[] {
    return [node, ...(node.Plans ?? []).flatMap(flattenPlan)];
}

export function topPlanRows(explainJson: unknown): number | null {
    if (!Array.isArray(explainJson)) return null;
    const plan = (explainJson[0] as { Plan?: PlanNode } | undefined)?.Plan;
    return plan?.['Plan Rows'] ?? null;
}

export function executionSeconds(explainAnalyzeJson: unknown): number | null {
    if (!Array.isArray(explainAnalyzeJson)) return null;
    const ms = (explainAnalyzeJson[0] as { 'Execution Time'?: number } | undefined)?.[
        'Execution Time'
    ];
    return typeof ms === 'number' ? ms / 1000 : null;
}

export function formatSeconds(seconds: number): string {
    if (seconds < 1) return '<1s';
    if (seconds < 90) return `~${Math.round(seconds)}s`;
    return `~${Math.round(seconds / 60)} min`;
}

const num = (n: number): string => n.toLocaleString('en-US');

export function analyzeRowEstimate(
    fact: MigrationFact,
    explainJson: unknown,
    largeRowThreshold: number,
    scanSeconds: number | null,
): Finding {
    const rows = topPlanRows(explainJson);
    if (rows === null) {
        return {
            check: 'row-estimate',
            severity: 'warn',
            migration: fact.migration,
            table: null,
            summary: `could not read a row estimate for the "${fact.migration}" backfill`,
            action: null,
            actionKind: null,
            data: { explainJson },
        };
    }
    const big = rows >= largeRowThreshold;
    const passes = fact.batchSize ? Math.max(1, Math.ceil(rows / fact.batchSize)) : 1;
    const measured =
        scanSeconds !== null
            ? `; one scan of the target rows measured ${formatSeconds(scanSeconds)} on this instance`
            : '';
    const transactional = fact.runsInTransaction
        ? 'in a single transaction'
        : fact.batchSize
          ? `in batches of ${fact.batchSize}${fact.resumable ? ', resumable' : ''}${passes > 1 ? ` (~${num(passes)} passes)` : ''}`
          : 'outside a transaction';
    const windowSize =
        scanSeconds === null
            ? `sized for ~${num(rows)} rows — row locks are held until commit`
            : scanSeconds >= 60
              ? `of at least ${formatSeconds(scanSeconds)} — reading the target rows alone measured that here, and the UPDATE holds row locks for longer`
              : `— the target-row scan measured ${formatSeconds(scanSeconds)} here, but the single-transaction UPDATE on ~${num(rows)} rows holds row locks until commit`;
    const windowAction = `schedule a maintenance window ${windowSize}`;
    return {
        check: 'row-estimate',
        severity: big && fact.runsInTransaction ? 'warn' : 'ok',
        migration: fact.migration,
        table: fact.tables.find((t) => t.access.includes('write'))?.name ?? null,
        summary: `backfill touches ~${num(rows)} rows here, ${transactional}${measured}`,
        action: big && fact.runsInTransaction ? windowAction : null,
        actionKind: big && fact.runsInTransaction ? 'plan' : null,
        data: { estimatedRows: rows, passes, scanSeconds },
    };
}

/** above this fraction of the table, an index cannot beat the scan — the scan IS the work */
const INDEX_USELESS_FRACTION = 0.5;

export function analyzeSeqScans(
    fact: MigrationFact,
    explainJson: unknown,
    liveTuplesByTable: Map<string, number>,
    largeRowThreshold: number,
    estimatedRows: number | null,
    scanSeconds: number | null,
): Finding[] {
    if (!Array.isArray(explainJson)) return [];
    const plan = (explainJson[0] as { Plan?: PlanNode } | undefined)?.Plan;
    if (!plan) return [];
    const findings: Finding[] = [];
    const measured =
        scanSeconds !== null
            ? `; one full scan measured ${formatSeconds(scanSeconds)} on this instance`
            : '';
    for (const node of flattenPlan(plan)) {
        if (node['Node Type'] !== 'Seq Scan' || !node['Relation Name']) continue;
        const table = node['Relation Name'];
        const liveTuples = liveTuplesByTable.get(table) ?? 0;
        if (liveTuples < largeRowThreshold) continue;
        const fraction =
            estimatedRows !== null && liveTuples > 0 ? estimatedRows / liveTuples : null;
        const base = { check: 'plan' as const, severity: 'warn' as const, migration: fact.migration, table };
        if (fraction !== null && fraction >= INDEX_USELESS_FRACTION) {
            findings.push({
                ...base,
                summary: `the backfill's predicate matches ~${Math.round(fraction * 100)}% of "${table}" (${num(estimatedRows as number)} of ${num(liveTuples)} rows) — no index can help; the scan is the work${measured}`,
                action: `size the window for the update work on ~${num(estimatedRows as number)} rows${scanSeconds !== null ? ` (the scan itself measured ${formatSeconds(scanSeconds)} here)` : ''}`,
                actionKind: 'plan',
                data: { liveTuples, estimatedRows, fraction, scanSeconds },
            });
        } else if (fact.backfill?.supportingIndexSql) {
            findings.push({
                ...base,
                summary: `the backfill seq-scans "${table}" (~${num(liveTuples)} live rows) to reach ~${estimatedRows === null ? '?' : num(estimatedRows)} target rows — no usable index on this instance, but the facts carry a vetted one${measured}`,
                action: `run: ${fact.backfill.supportingIndexSql}; — CONCURRENTLY does not block writes; then re-run preflight: this finding disappears once the planner uses the index`,
                actionKind: 'remediate',
                data: { liveTuples, estimatedRows, fraction, scanSeconds },
            });
        } else {
            findings.push({
                ...base,
                summary: `the backfill seq-scans "${table}" (~${num(liveTuples)} live rows) — no usable index for its predicate on this instance, and the facts carry no vetted one${measured}`,
                action: `expect ${scanSeconds !== null ? formatSeconds(scanSeconds) : 'a full-table scan'}${fact.batchSize ? ' of scan work PER PASS in the worst case' : ' of scan time'}; check the release notes for a supporting index, or accept the scan`,
                actionKind: 'plan',
                data: { liveTuples, estimatedRows, fraction, scanSeconds },
            });
        }
    }
    return findings;
}

// --- upgrade strategy --------------------------------------------------------

/**
 * Fires whenever the range contains DDL, independent of any measured hazard:
 * old pods keep querying the tables being altered, the ALTER queues behind
 * them, and everything else then queues behind the ALTER — the advice must
 * surface even on a quiet instance.
 */
export function analyzeUpgradeStrategy(facts: MigrationFact[]): Finding[] {
    const ddlTables = [
        ...new Set(
            facts.flatMap((fact) =>
                fact.tables
                    .filter((table) => table.access.includes('ddl'))
                    .map((table) => table.name),
            ),
        ),
    ];
    if (ddlTables.length === 0) return [];
    return [
        {
            check: 'strategy',
            severity: 'info',
            migration: null,
            table: null,
            summary: `this range runs DDL against ${ddlTables.map((t) => `"${t}"`).join(', ')} — live pods keep querying those tables, an ALTER TABLE queues behind them, and every later query queues behind the ALTER`,
            action: `upgrade with strategy Recreate (stop old pods before migrations run — the marker's recommendedStrategy), pause schedulers/crons that write to those tables, and protect the migration job from eviction (raise activeDeadlineSeconds, set a PriorityClass) — a job killed mid-migration is what leaves the stale lock behind`,
            actionKind: 'plan',
            data: { ddlTables },
        },
    ];
}

// --- activity / locks --------------------------------------------------------

export interface ActivityRow {
    pid: number;
    usename: string | null;
    application_name: string | null;
    state: string | null;
    xact_age_s: number | null;
    query: string | null;
    blocked_by: number[] | null;
}

export function analyzeActivity(
    rows: ActivityRow[],
    longTxnThresholdSeconds: number,
): Finding[] {
    const findings: Finding[] = [];
    for (const row of rows) {
        const blockedBy = row.blocked_by ?? [];
        if (blockedBy.length > 0) {
            findings.push({
                check: 'activity',
                severity: 'blocker',
                migration: null,
                table: null,
                summary: `pid ${row.pid} (${row.application_name || row.usename || 'unknown'}) is waiting on a lock held by pid(s) ${blockedBy.join(', ')} — the migration would queue behind the same locks`,
                action: `inspect and end the blocking session(s), then re-run preflight: SELECT pg_terminate_backend(pid) once you know what it is`,
                actionKind: 'remediate',
                data: { pid: row.pid, blockedBy, query: row.query },
            });
        } else if ((row.xact_age_s ?? 0) >= longTxnThresholdSeconds) {
            findings.push({
                check: 'activity',
                severity: 'warn',
                migration: null,
                table: null,
                summary: `pid ${row.pid} (${row.application_name || row.usename || 'unknown'}) has held a transaction open for ${Math.round(Number(row.xact_age_s) / 60)} min — any ALTER TABLE will queue behind it and block everything else`,
                action: 'let this session finish (or terminate it), then re-run preflight',
                actionKind: 'remediate',
                data: { pid: row.pid, xactAgeSeconds: row.xact_age_s, query: row.query },
            });
        }
    }
    if (findings.length === 0) {
        findings.push({
            check: 'activity',
            severity: 'ok',
            migration: null,
            table: null,
            summary: 'no long-running transactions or lock waits',
            action: null,
            actionKind: null,
            data: {},
        });
    }
    return findings;
}

// --- report ------------------------------------------------------------------

export interface PreflightReport {
    from: string;
    to: string;
    migrations: string[];
    findings: Finding[];
    remediateNow: string[];
    planItems: string[];
    verdict: Severity;
}

export function buildReport(
    from: string,
    to: string,
    facts: MigrationFact[],
    findings: Finding[],
): PreflightReport {
    const sorted = [...findings].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
    const actions = (kind: 'remediate' | 'plan') =>
        sorted
            .filter((f) => f.action !== null && f.actionKind === kind)
            .map((f) => f.action as string);
    const verdict = sorted.some((f) => f.severity === 'blocker')
        ? 'blocker'
        : sorted.some((f) => f.severity === 'warn')
          ? 'warn'
          : 'ok';
    return {
        from,
        to,
        migrations: facts.map((f) => f.migration),
        findings: sorted,
        remediateNow: actions('remediate'),
        planItems: actions('plan'),
        verdict,
    };
}

const SEVERITY_ICON: Record<Severity, string> = {
    blocker: '✖',
    warn: '⚠',
    info: 'ℹ',
    ok: '✓',
};

export function renderHuman(report: PreflightReport): string {
    const lines: string[] = [];
    lines.push(`Upgrade preflight: ${report.from} → ${report.to}`);
    lines.push(
        `Migrations with facts in range: ${report.migrations.length === 0 ? '(none)' : ''}`,
    );
    for (const m of report.migrations) lines.push(`  - ${m}`);
    lines.push('');
    for (const f of report.findings) {
        lines.push(`${SEVERITY_ICON[f.severity]} [${f.check}] ${f.summary}`);
        if (f.action) lines.push(`    → ${f.action}`);
    }
    lines.push('');
    if (report.remediateNow.length === 0 && report.planItems.length === 0) {
        lines.push('No preparation needed — clear to upgrade.');
    }
    if (report.remediateNow.length > 0) {
        lines.push('REMEDIATE NOW — fix these, then re-run preflight to verify:');
        report.remediateNow.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
        lines.push('');
    }
    if (report.planItems.length > 0) {
        lines.push('PLAN DIFFERENTLY — these cannot be fixed in place, only planned around:');
        report.planItems.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
        lines.push('');
    }
    lines.push(
        'The loop: remediate → re-run preflight → upgrade only when the run is clean,',
        'or when every remaining warning is a plan item you have consciously accepted.',
        'Exit codes gate automation: 0 clean / 1 warnings / 2 blockers.',
    );
    lines.push('');
    lines.push(`Verdict: ${report.verdict.toUpperCase()}`);
    return lines.join('\n');
}

// --- IO shell -----------------------------------------------------------------

interface ApiProbe {
    serverTime: string;
    lock: { isLocked: boolean; activeMigrationBackends: number } | null;
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

export function makePsqlRunner(psqlCommand: string): PsqlRunner {
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
        `BEGIN TRANSACTION READ ONLY; ${sql}; ROLLBACK;`;
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

interface CliArgs {
    facts: string;
    from: string;
    to: string;
    psql: string;
    intervalSeconds: number;
    json: boolean;
    writeRateThreshold: number;
    largeRowThreshold: number;
    longTxnThresholdSeconds: number;
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

function parseArgs(argv: string[]): CliArgs {
    const get = (flag: string): string | null => {
        const i = argv.indexOf(flag);
        const value = i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
        return value !== null && value.startsWith('--') ? null : value;
    };
    const facts = get('--facts');
    const from = get('--from');
    const to = get('--to');
    if (!facts || !from || !to) {
        throw new Error(
            'usage: preflight.ts --facts <file> --from <current version> --to <target version> [--psql "<cmd>" | --api <baseUrl>] [--interval <s>] [--json] [--no-measure]',
        );
    }
    return {
        facts,
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
        measure: !argv.includes('--no-measure'),
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
    findings.push(analyzeLock(lockRows, after.lock?.activeMigrationBackends ?? 0));

    const rates = computeWriteRates(
        statRowsFromProbe(before),
        statRowsFromProbe(after),
        args.intervalSeconds,
    );
    findings.push(...analyzeWriteRates(facts, rates, args.writeRateThreshold));

    findings.push(...analyzeActivity(activityRowsFromProbe(after), args.longTxnThresholdSeconds));

    findings.push(...analyzeUpgradeStrategy(facts));

    const skipped = facts.filter((f) => f.backfill !== null);
    if (skipped.length > 0) {
        findings.push({
            check: 'row-estimate',
            severity: 'warn',
            migration: null,
            table: null,
            summary: `EXPLAIN-based checks (row estimates, index/plan shape, measured durations) skipped in API mode for ${skipped.length} backfill(s) — they need facts SQL executed against the database, which this endpoint deliberately does not do`,
            action: 'run preflight with direct database access for full coverage, or wait for server-side verified-facts probing (open design question)',
            actionKind: 'plan',
            data: { skippedMigrations: skipped.map((f) => f.migration) },
        });
    }
    return findings;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const factsFile = parseFactsFile(fs.readFileSync(args.facts, 'utf-8'));
    const facts = selectFacts(factsFile.migrationFacts, args.from, args.to);

    if (args.api !== null) {
        const apiFindings = await runApiMode(args, facts);
        const apiReport = buildReport(args.from, args.to, facts, apiFindings);
        console.log(args.json ? JSON.stringify(apiReport, null, 2) : renderHuman(apiReport));
        process.exit(apiReport.verdict === 'blocker' ? 2 : apiReport.verdict === 'warn' ? 1 : 0);
    }

    const db = makePsqlRunner(args.psql);
    const findings: Finding[] = [];

    let lockRows: LockRow[] | null;
    try {
        lockRows = db.json('SELECT "index", is_locked FROM knex_migrations_lock') as LockRow[];
    } catch {
        lockRows = null;
    }
    const migrationBackends = db.json(
        `SELECT count(*)::integer AS n FROM pg_stat_activity WHERE state <> 'idle' AND pid <> pg_backend_pid() AND query ILIKE '%knex_migrations%'`,
    ) as Array<{ n: number }>;
    findings.push(analyzeLock(lockRows, migrationBackends[0]?.n ?? 0));
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

    for (const fact of facts) {
        if (!fact.backfill) continue;
        try {
            const estimate = db.explain(fact.backfill.estimateSql);
            const estimatedRows = topPlanRows(estimate);
            let scanSeconds: number | null = null;
            if (args.measure) {
                try {
                    scanSeconds = executionSeconds(db.explainAnalyze(fact.backfill.estimateSql));
                } catch {
                    scanSeconds = null;
                }
            }
            findings.push(
                analyzeRowEstimate(fact, estimate, args.largeRowThreshold, scanSeconds),
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
                    estimatedRows,
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

    const report = buildReport(args.from, args.to, facts, findings);
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
