export type PreflightVerdict = 'ok' | 'warn' | 'blocker';

export type PreflightSeverity = PreflightVerdict | 'info';

export interface PreflightTableFact {
    name: string;
    access: Array<'read' | 'write' | 'ddl'>;
    expectedLockModes: string[];
}

export interface PreflightMigrationFact {
    migration: string;
    introducedIn: string;
    runsInTransaction: boolean;
    resumable: boolean;
    batchSize: number | null;
    lockTimeout: string | null;
    tables: PreflightTableFact[];
    backfill: {
        description: string;
        estimateSql: string;
        planSql: string | null;
        supportingIndexSql: string | null;
        perPassCost?: 'remaining' | 'table';
    } | null;
    notes: string | null;
}

export interface PreflightFactsFile {
    schemaVersion: string;
    release: string | null;
    previousRelease: string | null;
    migrationsInRelease: number | null;
    migrationsWithoutFacts: string[] | null;
    enterpriseMigrationsInRelease?: number | null;
    enterpriseMigrationsWithoutFacts?: string[] | null;
    migrationFacts: PreflightMigrationFact[];
}

export interface MergedPreflightFacts {
    schemaVersion: string;
    migrationsInRelease: number;
    migrationsWithoutFacts: string[];
    unknownCoverageFiles: number;
    enterpriseMigrationsWithoutFacts: string[];
    migrationFacts: PreflightMigrationFact[];
}

export interface PreflightRangeCoverage {
    gaps: Array<{ from: string; to: string }>;
    unknownReleaseFiles: number;
}

export interface PreflightFinding {
    check: string;
    severity: PreflightSeverity;
    migration: string | null;
    table: string | null;
    summary: string;
    action: string | null;
    actionKind: 'remediate' | 'plan' | null;
    data: Record<string, unknown>;
}

export interface PreflightReport {
    from: string;
    to: string;
    migrations: string[];
    findings: PreflightFinding[];
    remediateNow: string[];
    planItems: string[];
    coverage: {
        migrationsInRelease: number;
        migrationsWithoutFacts: string[];
        unknownCoverageFiles: number;
        gaps: Array<{ from: string; to: string }>;
        unknownReleaseFiles: number;
    };
    verdict: PreflightVerdict;
}

export interface PreflightLockRow {
    index: number;
    is_locked: number;
}

export interface PreflightStatRow {
    relname: string;
    n_tup_ins: number;
    n_tup_upd: number;
    n_tup_del: number;
    n_live_tup: number;
}

export interface PreflightWriteRate {
    table: string;
    rowsPerMin: number;
    inserts: number;
    updates: number;
    deletes: number;
    liveTuples: number;
}

export interface PreflightActivityRow {
    pid: number;
    usename: string | null;
    application_name: string | null;
    state: string | null;
    xact_age_s: number | null;
    query: string | null;
    blocked_by: number[] | null;
}

export interface PreflightCore {
    parseFactsFile: (raw: string) => PreflightFactsFile;
    mergeFactsFiles: (files: PreflightFactsFile[]) => MergedPreflightFacts;
    findRangeGaps: (
        files: Array<{
            release: string | null;
            previousRelease: string | null;
        }>,
        from: string,
        to: string,
    ) => PreflightRangeCoverage;
    selectFacts: (
        facts: PreflightMigrationFact[],
        from: string,
        to: string,
    ) => PreflightMigrationFact[];
    analyzeLock: (
        lockRows: PreflightLockRow[] | null,
        lastMigrationAgeSeconds: number | null,
    ) => PreflightFinding;
    computeWriteRates: (
        before: PreflightStatRow[],
        after: PreflightStatRow[],
        intervalSeconds: number,
    ) => PreflightWriteRate[];
    analyzeWriteRates: (
        facts: PreflightMigrationFact[],
        rates: PreflightWriteRate[],
        thresholdRowsPerMin: number,
    ) => PreflightFinding[];
    analyzeActivity: (
        rows: PreflightActivityRow[],
        longTxnThresholdSeconds: number,
    ) => PreflightFinding[];
    analyzeLockTimeouts: (
        facts: PreflightMigrationFact[],
        liveTuplesByTable: Map<string, number>,
        largeRowThreshold: number,
    ) => PreflightFinding[];
    analyzeUpgradeStrategy: (
        facts: PreflightMigrationFact[],
    ) => PreflightFinding[];
    buildReport: (
        from: string,
        to: string,
        facts: PreflightMigrationFact[],
        findings: PreflightFinding[],
        coverage: MergedPreflightFacts,
        rangeCoverage: PreflightRangeCoverage,
        enterpriseMigrationsWithoutFacts: string[],
    ) => PreflightReport;
    renderHuman: (report: PreflightReport) => string;
}

export const getUnwiredPreflightCore = (): PreflightCore => {
    throw new Error(
        'The preflight analysis core is not yet wired into @lightdash/cli',
    );
};
