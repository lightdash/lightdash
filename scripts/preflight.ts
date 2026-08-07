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
    /** absent means 'remaining'; optional so assets predating the field still validate */
    perPassCost?: 'remaining' | 'table';
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
    release: string | null;
    previousRelease: string | null;
    migrationsInRelease: number | null;
    migrationsWithoutFacts: string[] | null;
    enterpriseMigrationsInRelease?: number | null;
    enterpriseMigrationsWithoutFacts?: string[] | null;
    migrationFacts: MigrationFact[];
}

export interface FactsCoverage {
    migrationsInRelease: number;
    migrationsWithoutFacts: string[];
    unknownCoverageFiles: number;
}

export interface FactsRangeCoverage {
    gaps: { from: string; to: string }[];
    unknownReleaseFiles: number;
}

export interface MergedFactsFile extends FactsCoverage {
    schemaVersion: string;
    enterpriseMigrationsWithoutFacts: string[];
    migrationFacts: MigrationFact[];
}

export const FACTS_SCHEMA_PATH = path.join(__dirname, 'preflight-facts.schema.json');

const SUPPORTING_INDEX_SQL_PATTERN =
    /^CREATE (UNIQUE )?INDEX CONCURRENTLY (IF NOT EXISTS )?[A-Za-z0-9_" .()=<>'!,-]+$/;

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
        const supportingIndexSql = fact.backfill?.supportingIndexSql;
        if (supportingIndexSql?.includes(';')) {
            throw new Error(
                `supportingIndexSql for "${fact.migration}" contains ';' — index DDL must be a single statement`,
            );
        }
        if (
            supportingIndexSql !== null &&
            supportingIndexSql !== undefined &&
            !SUPPORTING_INDEX_SQL_PATTERN.test(supportingIndexSql)
        ) {
            throw new Error(
                `supportingIndexSql for "${fact.migration}" must be a single CREATE [UNIQUE] INDEX CONCURRENTLY statement using only the supported SQL characters`,
            );
        }
    }
    return factsFile;
}

/** merge per-release facts files (one asset per release in the jump); duplicate migrations are a facts bug */
export function mergeFactsFiles(files: FactsFile[]): MergedFactsFile {
    if (files.length === 0) throw new Error('no facts files given');
    const schemaVersion = files[0].schemaVersion;
    const seen = new Set<string>();
    const migrationFacts: MigrationFact[] = [];
    let migrationsInRelease = 0;
    const migrationsWithoutFacts: string[] = [];
    let unknownCoverageFiles = 0;
    const enterpriseMigrationsWithoutFacts: string[] = [];
    for (const file of files) {
        if (file.schemaVersion !== schemaVersion) {
            throw new Error(
                `facts files use different schema versions: expected "${schemaVersion}", got "${file.schemaVersion}"`,
            );
        }
        if (
            file.migrationsInRelease === null ||
            file.migrationsWithoutFacts === null
        ) {
            unknownCoverageFiles += 1;
        } else {
            migrationsInRelease += file.migrationsInRelease;
            migrationsWithoutFacts.push(...file.migrationsWithoutFacts);
        }
        enterpriseMigrationsWithoutFacts.push(
            ...(file.enterpriseMigrationsWithoutFacts ?? []),
        );
        for (const fact of file.migrationFacts) {
            if (seen.has(fact.migration)) {
                throw new Error(
                    `migration "${fact.migration}" appears in more than one facts file — each release asset must carry only its own migrations`,
                );
            }
            seen.add(fact.migration);
            migrationFacts.push(fact);
        }
    }
    return {
        schemaVersion,
        migrationsInRelease,
        migrationsWithoutFacts: migrationsWithoutFacts.sort(),
        unknownCoverageFiles,
        enterpriseMigrationsWithoutFacts: enterpriseMigrationsWithoutFacts.sort(),
        migrationFacts,
    };
}

export function findRangeGaps(
    files: { release: string | null; previousRelease: string | null }[],
    from: string,
    to: string,
): FactsRangeCoverage {
    let unknownReleaseFiles = 0;
    const knownFiles = files
        .flatMap((file) => {
            if (file.release === null || file.previousRelease === null) {
                unknownReleaseFiles += 1;
                return [];
            }
            return [{ release: file.release, previousRelease: file.previousRelease }];
        })
        // Sorted by where each asset STARTS: this is an interval merge, and
        // sorting by the end lets a nested asset open a gap its enclosing one
        // already covers.
        .sort((a, b) => compareVersions(a.previousRelease, b.previousRelease));
    const gaps: { from: string; to: string }[] = [];
    let cursor = from;
    for (const file of knownFiles) {
        // Only the requested range matters: assets past `to` cannot leave a gap
        // in it, and assets below the cursor are already covered.
        if (compareVersions(cursor, to) >= 0) break;
        if (compareVersions(file.release, cursor) <= 0) continue;
        const gapEnd =
            compareVersions(file.previousRelease, to) > 0 ? to : file.previousRelease;
        if (compareVersions(gapEnd, cursor) > 0) {
            gaps.push({ from: cursor, to: gapEnd });
        }
        cursor = file.release;
    }
    if (compareVersions(cursor, to) < 0) {
        gaps.push({ from: cursor, to });
    }
    return { gaps, unknownReleaseFiles };
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
    check: 'stale-lock' | 'write-rate' | 'row-estimate' | 'plan' | 'activity' | 'strategy' | 'coverage' | 'lock-timeout';
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
    lastMigrationAgeSeconds: number | null,
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
            data: { lastMigrationAgeSeconds },
        };
    }
    const migrationEvidence =
        lastMigrationAgeSeconds === null
            ? 'the latest completed-migration age is unavailable'
            : `the latest completed migration was ${formatSeconds(lastMigrationAgeSeconds)} ago`;
    return {
        check: 'stale-lock',
        severity: 'blocker',
        migration: null,
        table: 'knex_migrations_lock',
        summary: `migration lock is held; ${migrationEvidence}, and recent table write activity is reported separately — this tool cannot prove whether a migration is live`,
        action: 'first confirm no migration job or container is running (check kubectl get jobs and your scheduler); only then clear and repair the lock with: DELETE FROM knex_migrations_lock; INSERT INTO knex_migrations_lock (is_locked) VALUES (0); — then re-run preflight',
        actionKind: 'remediate',
        data: { lastMigrationAgeSeconds },
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
    tableLiveTuples: number,
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
    const perPassCost = fact.backfill?.perPassCost ?? 'remaining';
    // A full-table pass costs at least the target rows, so never let an absent
    // or un-analyzed live-tuple count (0) rate a big backfill lower than the
    // target count alone would.
    const costRows =
        perPassCost === 'table' ? Math.max(rows, tableLiveTuples) : rows;
    const big = costRows >= largeRowThreshold;
    const passes = fact.batchSize ? Math.max(1, Math.ceil(rows / fact.batchSize)) : 1;
    let measured = '';
    if (scanSeconds !== null) {
        const measuredWork =
            perPassCost === 'table' ? 'full-table pass' : 'scan of the target rows';
        measured = `; one ${measuredWork} measured ${formatSeconds(scanSeconds)} on this instance`;
    }
    const transactional = fact.runsInTransaction
        ? 'in a single transaction'
        : fact.batchSize
          ? `in batches of ${fact.batchSize}${fact.resumable ? ', resumable' : ''}${passes > 1 ? ` (~${num(passes)} passes)` : ''}`
          : 'outside a transaction';
    const windowSize =
        scanSeconds === null
            ? `sized for ~${num(costRows)} rows — row locks are held until commit`
            : scanSeconds >= 60
              ? `of at least ${formatSeconds(scanSeconds)} — reading the target rows alone measured that here, and the UPDATE holds row locks for longer`
              : `— the target-row scan measured ${formatSeconds(scanSeconds)} here, but the single-transaction UPDATE on ~${num(rows)} rows holds row locks until commit`;
    const windowAction = `schedule a maintenance window ${windowSize}`;
    const perPassAction = `size the window for repeated full-table passes over ~${num(tableLiveTuples)} rows — each pass costs the same regardless of how much work is left`;
    const showPerPassCost =
        perPassCost === 'table' && rows < tableLiveTuples * 0.9;
    const summary =
        showPerPassCost
            ? `backfill repairs ~${num(rows)} rows here, ${transactional}, but every pass scans or sorts all ${num(tableLiveTuples)} rows of "${fact.tables.find((table) => table.access.includes('write'))?.name ?? 'unknown'}" — cost does not fall as the work drains${measured}`
            : `backfill touches ~${num(rows)} rows here, ${transactional}${measured}`;
    const warnsForTablePasses = big && perPassCost === 'table';
    const warnsForTransaction = big && fact.runsInTransaction;
    let action: string | null = null;
    if (warnsForTablePasses) {
        action = perPassAction;
    } else if (warnsForTransaction) {
        action = windowAction;
    }
    return {
        check: 'row-estimate',
        severity: warnsForTransaction || warnsForTablePasses ? 'warn' : 'ok',
        migration: fact.migration,
        table: fact.tables.find((t) => t.access.includes('write'))?.name ?? null,
        summary,
        action,
        actionKind: action === null ? null : 'plan',
        data: { estimatedRows: rows, passes, scanSeconds, perPassCost, tableLiveTuples },
    };
}

/** above this fraction of the table, an index cannot beat the scan — the scan IS the work */
const INDEX_USELESS_FRACTION = 0.5;

export function analyzeSeqScans(
    fact: MigrationFact,
    explainJson: unknown,
    liveTuplesByTable: Map<string, number>,
    largeRowThreshold: number,
    scanSeconds: number | null,
): Finding[] {
    if (!Array.isArray(explainJson)) return [];
    const plan = (explainJson[0] as { Plan?: PlanNode } | undefined)?.Plan;
    if (!plan) return [];
    const findings: Finding[] = [];
    const writtenTable = fact.tables.find((table) => table.access.includes('write'))?.name;
    for (const node of flattenPlan(plan)) {
        if (node['Node Type'] !== 'Seq Scan' || !node['Relation Name']) continue;
        const table = node['Relation Name'];
        const liveTuples = liveTuplesByTable.get(table) ?? 0;
        if (liveTuples < largeRowThreshold) continue;
        const scansWrittenTable = table === writtenTable;
        const estimatedRows =
            scansWrittenTable && typeof node['Plan Rows'] === 'number'
                ? node['Plan Rows']
                : null;
        const fraction =
            estimatedRows !== null && liveTuples > 0 ? estimatedRows / liveTuples : null;
        const measured =
            scansWrittenTable && scanSeconds !== null
                ? `; the target-row scan measured ${formatSeconds(scanSeconds)} on this instance`
                : '';
        const base = { check: 'plan' as const, severity: 'warn' as const, migration: fact.migration, table };
        if (fraction !== null && fraction >= INDEX_USELESS_FRACTION) {
            findings.push({
                ...base,
                summary: `the backfill's predicate matches ~${Math.round(fraction * 100)}% of "${table}" (${num(estimatedRows as number)} of ${num(liveTuples)} rows) — no index can help; the scan is the work${measured}`,
                action: `size the window for the update work on ~${num(estimatedRows as number)} rows${scanSeconds !== null ? ` (the scan itself measured ${formatSeconds(scanSeconds)} here)` : ''}`,
                actionKind: 'plan',
                data: { liveTuples, estimatedRows, fraction, scanSeconds },
            });
        } else if (scansWrittenTable && fact.backfill?.supportingIndexSql) {
            findings.push({
                ...base,
                summary: `the backfill's predicate matches ${fraction === null ? 'an unknown fraction' : `~${Math.round(fraction * 100)}%`} of "${table}" (${estimatedRows === null ? '?' : num(estimatedRows)} of ${num(liveTuples)} rows) — no usable index on this instance, but the facts carry a vetted one${measured}`,
                action: `review this index DDL with your DBA, then run it: ${fact.backfill.supportingIndexSql} — CONCURRENTLY does not block writes; re-run preflight afterwards`,
                actionKind: 'remediate',
                data: { liveTuples, estimatedRows, fraction, scanSeconds },
            });
        } else {
            const targetFraction =
                scansWrittenTable && fraction !== null
                    ? `; its predicate matches ~${Math.round(fraction * 100)}% (${num(estimatedRows as number)} of ${num(liveTuples)} rows)`
                    : '';
            findings.push({
                ...base,
                summary: `the backfill seq-scans "${table}" (~${num(liveTuples)} live rows)${targetFraction} — no usable index for this relation on this instance${scansWrittenTable ? ', and the facts carry no vetted one' : ''}${measured}`,
                action: `expect ${scanSeconds !== null && scansWrittenTable ? `${formatSeconds(scanSeconds)} of measured target-scan time` : 'a full-table scan'}${fact.batchSize ? ' per pass in the worst case' : ''}; check the release notes for a supporting index, or accept the scan`,
                actionKind: 'plan',
                data: scansWrittenTable
                    ? { liveTuples, estimatedRows, fraction, scanSeconds }
                    : { liveTuples },
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

export function analyzeLockTimeouts(
    facts: MigrationFact[],
    liveTuplesByTable: Map<string, number>,
    largeRowThreshold: number,
): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const fact of facts) {
        if (fact.lockTimeout === null) {
            for (const table of fact.tables) {
                const key = `${fact.migration}\u0000${table.name}`;
                if (table.access.includes('ddl') && !seen.has(key)) {
                    seen.add(key);
                    const liveTuples = liveTuplesByTable.get(table.name) ?? 0;
                    findings.push({
                        check: 'lock-timeout',
                        severity:
                            liveTuples >= largeRowThreshold ? 'warn' : 'info',
                        migration: fact.migration,
                        table: table.name,
                        summary: `migration "${fact.migration}" runs ALTER TABLE on "${table.name}"; the ALTER TABLE waits without limit for its exclusive lock behind any live reader`,
                        action: `stop or drain queries against "${table.name}" before the upgrade, because every later query queues behind the waiting ALTER`,
                        actionKind: 'plan',
                        data: { liveTuples },
                    });
                }
            }
        }
    }
    return findings;
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
    coverage: FactsCoverage & FactsRangeCoverage;
    verdict: Severity;
}

function coverageFinding(
    coverage: FactsCoverage & FactsRangeCoverage,
): Finding | null {
    const missing = coverage.migrationsWithoutFacts.length;
    const unknown = coverage.unknownCoverageFiles;
    const missingRanges = coverage.gaps.map((gap) => `${gap.from}..${gap.to}`);
    const rangeUnknown = missingRanges.length > 0 || coverage.unknownReleaseFiles > 0;
    if (missing === 0 && unknown === 0 && !rangeUnknown) return null;
    let summary: string;
    let action: string;
    if (rangeUnknown) {
        const reasons = [
            ...(missingRanges.length > 0
                ? [`missing asset ranges: ${missingRanges.join(', ')}`]
                : []),
            ...(coverage.unknownReleaseFiles > 0
                ? [
                      `${coverage.unknownReleaseFiles} facts file(s) do not identify their release range`,
                  ]
                : []),
        ];
        summary = `coverage is unknown — ${reasons.join('; ')}${missing > 0 ? `; facts are also missing for ${coverage.migrationsWithoutFacts.join(', ')}` : ''}`;
        action = `do not treat this preflight as complete: fetch generated facts assets spanning ${missingRanges.length > 0 ? missingRanges.join(', ') : 'the requested range'}${coverage.unknownReleaseFiles > 0 ? ' and replace files with unknown release bounds' : ''}${missing > 0 ? `; author facts for ${coverage.migrationsWithoutFacts.join(', ')}` : ''} before upgrading`;
    } else {
        summary =
            missing > 0 && unknown > 0
                ? `${missing} of ${coverage.migrationsInRelease} migrations in files with known coverage have no facts; coverage is also unknown for ${unknown} facts file(s)`
                : missing > 0
                  ? `${missing} of ${coverage.migrationsInRelease} migrations in this range have no facts; this run does not cover them`
                  : `coverage unknown for ${unknown} facts file(s); this run may not cover every migration in the range`;
        action =
            unknown > 0 && missing > 0
                ? `do not treat this preflight as complete: it cannot assess ${coverage.migrationsWithoutFacts.join(', ')} or tell whether the ${unknown} unknown-coverage file(s) omit more migrations; replace those files and author the known missing facts before upgrading`
                : unknown > 0
                  ? `do not treat this preflight as complete: it cannot tell whether the ${unknown} unknown-coverage file(s) omit migrations; replace them with generated assets that include coverage before upgrading`
                  : `do not treat this preflight as complete: it cannot assess ${coverage.migrationsWithoutFacts.join(', ')}; author those facts and regenerate the release asset, or assess those migrations manually before upgrading`;
    }
    return {
        check: 'coverage',
        severity: 'warn',
        migration: null,
        table: null,
        summary,
        action,
        actionKind: 'plan',
        data: { ...coverage },
    };
}

export function enterpriseCoverageFinding(
    enterpriseMigrationsWithoutFacts: string[],
): Finding | null {
    if (enterpriseMigrationsWithoutFacts.length === 0) return null;
    return {
        check: 'coverage',
        severity: 'info',
        migration: null,
        table: null,
        summary: `${enterpriseMigrationsWithoutFacts.length} Enterprise migration(s) in this range have no facts; they only run on a licensed instance, so they are not counted in the coverage verdict above`,
        action: null,
        actionKind: null,
        data: { enterpriseMigrationsWithoutFacts },
    };
}

export function buildReport(
    from: string,
    to: string,
    facts: MigrationFact[],
    findings: Finding[],
    coverage: FactsCoverage,
    rangeCoverage: FactsRangeCoverage,
    enterpriseMigrationsWithoutFacts: string[] = [],
): PreflightReport {
    const combinedCoverage = { ...coverage, ...rangeCoverage };
    const extra = [
        coverageFinding(combinedCoverage),
        enterpriseCoverageFinding(enterpriseMigrationsWithoutFacts),
    ].flatMap((finding) => (finding ? [finding] : []));
    const sorted = [...findings, ...extra].sort(
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
        coverage: combinedCoverage,
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
    if (
        report.remediateNow.length === 0 &&
        report.planItems.length === 0 &&
        report.coverage.migrationsWithoutFacts.length === 0 &&
        report.coverage.unknownCoverageFiles === 0 &&
        report.coverage.gaps.length === 0 &&
        report.coverage.unknownReleaseFiles === 0
    ) {
        lines.push(
            'All checks passed and every migration in range has facts — clear to upgrade.',
        );
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
