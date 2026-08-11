import { type Knex } from 'knex';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { type KnexMigrationState } from './migrationState';

export const MIN_SUPPORTED_POSTGRES_MAJOR = 12;
export const LONG_TRANSACTION_THRESHOLD_SECONDS = 5 * 60;
export const MIN_DISK_HEADROOM_BYTES = 5 * 1024 * 1024 * 1024;
export const RELEASE_SAFETY_ARTIFACT_PATH = '/usr/app/release-safety.json';

type MigrationHeaviness = {
    locksTable: boolean | 'unknown';
    rewritesTable: boolean | 'unknown';
    scansTable: boolean | 'unknown';
};

type ReleaseSafetyMigration = {
    name: string;
    edition: 'core' | 'ee';
    tables: string[];
    heaviness: MigrationHeaviness;
};

export type ReleaseSafetyArtifact = {
    schemaVersion: '2';
    version: string;
    previousVersion: string | null;
    migrations: {
        files: ReleaseSafetyMigration[];
    };
    upgrade: {
        minPreviousVersion: string | null;
        requiredStops: string[];
    };
};

export type ReleaseSafetyArtifactLoadResult =
    | {
          status: 'present';
          artifact: ReleaseSafetyArtifact;
          error: null;
          path: string;
      }
    | { status: 'present'; artifact: null; error: string; path: string }
    | { status: 'absent'; artifact: null; error: null; path: string };

export type PendingMigrationInventoryItem = {
    name: string;
    transaction: boolean | null;
    tables: string[];
    metadataAvailable: boolean;
};

export type PostgresVersionProbeResult = {
    serverVersion: string;
    serverVersionNum: number;
};

export type MigrationPrivilegesProbeResult = {
    schemaName: string | null;
    canCreateInSchema: boolean;
    unownedTables: string[];
};

export type RelationActivityProbeResult = {
    pid: number;
    table: string;
    lockMode: string;
    transactionAgeSeconds: number | null;
};

export type DiskHeadroomProbeResult = {
    availableBytes: number | null;
    source: 'configured' | 'unavailable';
};

export type PreflightProbe = {
    getPostgresVersion: () => Promise<PostgresVersionProbeResult>;
    getMigrationPrivileges: (
        tables: string[],
    ) => Promise<MigrationPrivilegesProbeResult>;
    getRelationActivity: (
        tables: string[],
    ) => Promise<RelationActivityProbeResult[]>;
    getDiskHeadroom: () => Promise<DiskHeadroomProbeResult>;
};

type RedOutcome = 'pass' | 'fail';
type YellowOutcome = 'pass' | 'warn';

type VersionPathCheckBase = {
    id: 'version-path';
    message: string;
    data: {
        artifactPath: string;
        targetVersion: string | null;
        previousVersion: string | null;
        minPreviousVersion: string | null;
        requiredStops: string[];
        completedMigrationCount: number;
        pendingMigrationsOutsideArtifact: string[];
        artifactError: string | null;
    };
};

export type VersionPathCheck = VersionPathCheckBase &
    (
        | { severity: 'red'; outcome: RedOutcome }
        | { severity: 'yellow'; outcome: YellowOutcome }
    );

export type MigrationPrivilegesCheck = {
    id: 'migration-privileges';
    severity: 'red';
    outcome: RedOutcome;
    message: string;
    data: {
        schemaName: string | null;
        canCreateInSchema: boolean | null;
        unownedTables: string[];
        probeError: string | null;
    };
};

export type PostgresVersionCheck = {
    id: 'postgres-version';
    severity: 'red';
    outcome: RedOutcome;
    message: string;
    data: {
        serverVersion: string | null;
        serverVersionNum: number | null;
        minimumSupportedMajor: number;
        probeError: string | null;
    };
};

export type HeldLocksCheck = {
    id: 'held-locks';
    severity: 'yellow';
    outcome: YellowOutcome;
    message: string;
    data: {
        tables: string[];
        locks: RelationActivityProbeResult[];
        probeError: string | null;
    };
};

export type LongTransactionsCheck = {
    id: 'long-transactions';
    severity: 'yellow';
    outcome: YellowOutcome;
    message: string;
    data: {
        thresholdSeconds: number;
        transactions: RelationActivityProbeResult[];
        probeError: string | null;
    };
};

export type DiskHeadroomCheck = {
    id: 'disk-headroom';
    severity: 'yellow';
    outcome: YellowOutcome;
    message: string;
    data: {
        applicable: boolean;
        availableBytes: number | null;
        minimumBytes: number;
        source: 'configured' | 'unavailable';
    };
};

export type PendingMigrationsCheck = {
    id: 'pending-migrations';
    severity: 'info';
    outcome: 'info';
    message: string;
    data: {
        migrations: PendingMigrationInventoryItem[];
    };
};

export type PreflightCheck =
    | VersionPathCheck
    | MigrationPrivilegesCheck
    | PostgresVersionCheck
    | HeldLocksCheck
    | LongTransactionsCheck
    | DiskHeadroomCheck
    | PendingMigrationsCheck;

export type PreflightRunOptions = {
    force: boolean;
    strict: boolean;
};

export type PreflightReport = {
    schemaVersion: '1';
    decision: 'proceed' | 'proceed-with-warnings' | 'abort' | 'force-proceed';
    force: boolean;
    strict: boolean;
    summary: {
        red: number;
        yellow: number;
        info: number;
    };
    checks: PreflightCheck[];
};

type PreflightInput = {
    artifactLoad: ReleaseSafetyArtifactLoadResult;
    migrationState: KnexMigrationState;
    inventory: PendingMigrationInventoryItem[];
    probe: PreflightProbe;
    options: PreflightRunOptions;
};

type RawPostgresVersionResult = {
    rows: Array<{
        server_version: string;
        server_version_num: number | string;
    }>;
};

type RawMigrationPrivilegesResult = {
    rows: Array<{
        schema_name: string | null;
        can_create_in_schema: boolean;
    }>;
};

type RawUnownedTablesResult = {
    rows: Array<{
        table_name: string;
    }>;
};

type RawRelationActivityResult = {
    rows: Array<{
        pid: number | string;
        table_name: string;
        lock_mode: string;
        transaction_age_seconds: number | string | null;
    }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

const parseMigrationHeaviness = (value: unknown): MigrationHeaviness | null => {
    if (!isRecord(value)) {
        return null;
    }
    const values = [value.locksTable, value.rewritesTable, value.scansTable];
    if (
        !values.every((item) => typeof item === 'boolean' || item === 'unknown')
    ) {
        return null;
    }
    return {
        locksTable: value.locksTable as boolean | 'unknown',
        rewritesTable: value.rewritesTable as boolean | 'unknown',
        scansTable: value.scansTable as boolean | 'unknown',
    };
};

const parseReleaseSafetyMigration = (
    value: unknown,
): ReleaseSafetyMigration | null => {
    if (!isRecord(value)) {
        return null;
    }
    const heaviness = parseMigrationHeaviness(value.heaviness);
    if (
        typeof value.name !== 'string' ||
        (value.edition !== 'core' && value.edition !== 'ee') ||
        !isStringArray(value.tables) ||
        heaviness === null
    ) {
        return null;
    }
    return {
        name: value.name,
        edition: value.edition,
        tables: [...value.tables].sort(),
        heaviness,
    };
};

export const parseReleaseSafetyArtifact = (
    raw: string,
): ReleaseSafetyArtifact => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch (error) {
        throw new Error(
            `release-safety artifact is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (
        !isRecord(parsed) ||
        parsed.schemaVersion !== '2' ||
        typeof parsed.version !== 'string' ||
        (parsed.previousVersion !== null &&
            typeof parsed.previousVersion !== 'string') ||
        !isRecord(parsed.migrations) ||
        !Array.isArray(parsed.migrations.files) ||
        !isRecord(parsed.upgrade) ||
        (parsed.upgrade.minPreviousVersion !== null &&
            typeof parsed.upgrade.minPreviousVersion !== 'string') ||
        !isStringArray(parsed.upgrade.requiredStops)
    ) {
        throw new Error('release-safety artifact does not match contract v2');
    }
    const migrations = parsed.migrations.files.map(parseReleaseSafetyMigration);
    if (migrations.some((migration) => migration === null)) {
        throw new Error('release-safety artifact does not match contract v2');
    }
    return {
        schemaVersion: '2',
        version: parsed.version,
        previousVersion: parsed.previousVersion,
        migrations: {
            files: (migrations as ReleaseSafetyMigration[]).sort(
                (left, right) => left.name.localeCompare(right.name),
            ),
        },
        upgrade: {
            minPreviousVersion: parsed.upgrade.minPreviousVersion,
            requiredStops: [...parsed.upgrade.requiredStops].sort(),
        },
    };
};

export const resolveReleaseSafetyArtifactPath = ({
    override = process.env.RELEASE_SAFETY_ARTIFACT_PATH,
}: { override?: string } = {}): string => {
    if (override !== undefined && override.length > 0) {
        return path.resolve(override);
    }
    return RELEASE_SAFETY_ARTIFACT_PATH;
};

export const loadReleaseSafetyArtifact = async (
    artifactPath = resolveReleaseSafetyArtifactPath(),
): Promise<ReleaseSafetyArtifactLoadResult> => {
    try {
        const raw = await fs.readFile(artifactPath, 'utf8');
        return {
            status: 'present',
            artifact: parseReleaseSafetyArtifact(raw),
            error: null,
            path: artifactPath,
        };
    } catch (error) {
        if (isRecord(error) && error.code === 'ENOENT') {
            return {
                status: 'absent',
                artifact: null,
                error: null,
                path: artifactPath,
            };
        }
        return {
            status: 'present',
            artifact: null,
            error: error instanceof Error ? error.message : String(error),
            path: artifactPath,
        };
    }
};

export const normalizeMigrationName = (migrationName: string): string =>
    migrationName.replace(/\.(?:js|ts)$/, '');

const migrationDirectories = (config: Knex.MigratorConfig): string[] => {
    if (config.directory === undefined) {
        return [];
    }
    return typeof config.directory === 'string'
        ? [config.directory]
        : [...config.directory];
};

const readMigrationTransaction = async (
    config: Knex.MigratorConfig,
    migrationName: string,
): Promise<boolean | null> => {
    if (path.basename(migrationName) !== migrationName) {
        return null;
    }
    const reads = await Promise.all(
        migrationDirectories(config).map(async (directory) => {
            try {
                return {
                    source: await fs.readFile(
                        path.join(directory, migrationName),
                        'utf8',
                    ),
                    error: null,
                };
            } catch (error) {
                return {
                    source: null,
                    error:
                        isRecord(error) && error.code === 'ENOENT'
                            ? null
                            : error,
                };
            }
        }),
    );
    if (reads.some((read) => read.error !== null)) {
        return null;
    }
    const source = reads.find((read) => read.source !== null)?.source ?? null;
    return source === null
        ? null
        : !/(?:export\s+const\s+config(?:\s*:[^=]+)?|exports\.config)\s*=\s*\{[^}]*\btransaction\s*:\s*false\b[^}]*\}/s.test(
              source,
          );
};

export const getPendingMigrationInventory = async ({
    migrationState,
    migrationConfig,
    artifact,
    getTransaction = readMigrationTransaction,
}: {
    migrationState: KnexMigrationState;
    migrationConfig: Knex.MigratorConfig;
    artifact: ReleaseSafetyArtifact | null;
    getTransaction?: (
        config: Knex.MigratorConfig,
        migrationName: string,
    ) => Promise<boolean | null>;
}): Promise<PendingMigrationInventoryItem[]> => {
    const metadata = new Map(
        artifact?.migrations.files.map((migration) => [
            normalizeMigrationName(migration.name),
            migration,
        ]) ?? [],
    );
    return Promise.all(
        migrationState.pending.map(async (name) => {
            const migration =
                metadata.get(normalizeMigrationName(name)) ?? null;
            return {
                name,
                transaction: await getTransaction(migrationConfig, name),
                tables: migration === null ? [] : [...migration.tables].sort(),
                metadataAvailable: migration !== null,
            };
        }),
    );
};

const messageFromError = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const versionPathCheck = (
    artifactLoad: ReleaseSafetyArtifactLoadResult,
    migrationState: KnexMigrationState,
): VersionPathCheck => {
    const { artifact } = artifactLoad;
    const artifactMigrationNames = new Set(
        artifact?.migrations.files.map((migration) =>
            normalizeMigrationName(migration.name),
        ) ?? [],
    );
    const pendingMigrationsOutsideArtifact = migrationState.pending.filter(
        (migration) =>
            !artifactMigrationNames.has(normalizeMigrationName(migration)),
    );
    const data: VersionPathCheck['data'] = {
        artifactPath: artifactLoad.path,
        targetVersion: artifact?.version ?? null,
        previousVersion: artifact?.previousVersion ?? null,
        minPreviousVersion: artifact?.upgrade.minPreviousVersion ?? null,
        requiredStops: artifact?.upgrade.requiredStops ?? [],
        completedMigrationCount: migrationState.completed.length,
        pendingMigrationsOutsideArtifact,
        artifactError: artifactLoad.error,
    };
    if (artifactLoad.status === 'absent') {
        return {
            id: 'version-path',
            severity: 'yellow',
            outcome: 'warn',
            message:
                'No baked release-safety artifact is present; required-stop verification was skipped; upgrade-path safety cannot be verified on this image',
            data,
        };
    }
    if (artifact === null) {
        return {
            id: 'version-path',
            severity: 'red',
            outcome: 'fail',
            message: `The baked release-safety artifact could not be read: ${artifactLoad.error}`,
            data,
        };
    }
    if (migrationState.classification === 'diverged') {
        return {
            id: 'version-path',
            severity: 'red',
            outcome: 'fail',
            message: `The actual knex_migrations ledger diverges from local migration files: ${migrationState.offending.join(', ')}`,
            data,
        };
    }
    const freshInstall = migrationState.completed.length === 0;
    const directPredecessorOrUpToDate =
        pendingMigrationsOutsideArtifact.length === 0;
    const unresolvedHistoricalStops = artifact.upgrade.requiredStops.filter(
        (requiredStop) => requiredStop !== artifact.version,
    );
    if (freshInstall) {
        return {
            id: 'version-path',
            severity: 'red',
            outcome: 'pass',
            message:
                'The knex_migrations ledger is empty, so this is a fresh install rather than an upgrade path',
            data,
        };
    }
    if (
        !directPredecessorOrUpToDate &&
        (artifact.upgrade.minPreviousVersion !== null ||
            unresolvedHistoricalStops.length > 0)
    ) {
        return {
            id: 'version-path',
            severity: 'red',
            outcome: 'fail',
            message:
                'The ledger has pending migrations outside this release artifact, and contract v2 does not map the unresolved historical path boundaries to migration-ledger entries',
            data,
        };
    }
    let message =
        'The artifact declares no unresolved historical version-path boundary';
    if (
        artifact.upgrade.minPreviousVersion === null &&
        unresolvedHistoricalStops.length === 0
    ) {
        message =
            'The artifact declares no minimum previous version or required stops';
    } else if (directPredecessorOrUpToDate) {
        message =
            'The migration ledger structurally matches the target artifact direct-predecessor or up-to-date path';
    }
    return {
        id: 'version-path',
        severity: 'red',
        outcome: 'pass',
        message,
        data,
    };
};

const migrationPrivilegesCheck = async (
    probe: PreflightProbe,
    tables: string[],
): Promise<MigrationPrivilegesCheck> => {
    try {
        const result = await probe.getMigrationPrivileges(tables);
        const allowed =
            result.schemaName !== null &&
            result.canCreateInSchema &&
            result.unownedTables.length === 0;
        return {
            id: 'migration-privileges',
            severity: 'red',
            outcome: allowed ? 'pass' : 'fail',
            message: allowed
                ? `The migration user can create objects in schema ${result.schemaName} and owns all existing pending-migration tables`
                : `The migration user lacks required DDL privileges in schema ${result.schemaName}`,
            data: {
                schemaName: result.schemaName,
                canCreateInSchema: result.canCreateInSchema,
                unownedTables: [...result.unownedTables].sort(),
                probeError: null,
            },
        };
    } catch (error) {
        return {
            id: 'migration-privileges',
            severity: 'red',
            outcome: 'fail',
            message: `Migration privileges could not be verified: ${messageFromError(error)}`,
            data: {
                schemaName: null,
                canCreateInSchema: null,
                unownedTables: [],
                probeError: messageFromError(error),
            },
        };
    }
};

const postgresVersionCheck = async (
    probe: PreflightProbe,
): Promise<PostgresVersionCheck> => {
    try {
        const result = await probe.getPostgresVersion();
        const major = Math.floor(result.serverVersionNum / 10_000);
        const supported = major >= MIN_SUPPORTED_POSTGRES_MAJOR;
        return {
            id: 'postgres-version',
            severity: 'red',
            outcome: supported ? 'pass' : 'fail',
            message: supported
                ? `PostgreSQL ${result.serverVersion} is supported`
                : `PostgreSQL ${result.serverVersion} is unsupported; version ${MIN_SUPPORTED_POSTGRES_MAJOR} or newer is required`,
            data: {
                serverVersion: result.serverVersion,
                serverVersionNum: result.serverVersionNum,
                minimumSupportedMajor: MIN_SUPPORTED_POSTGRES_MAJOR,
                probeError: null,
            },
        };
    } catch (error) {
        return {
            id: 'postgres-version',
            severity: 'red',
            outcome: 'fail',
            message: `The PostgreSQL version could not be verified: ${messageFromError(error)}`,
            data: {
                serverVersion: null,
                serverVersionNum: null,
                minimumSupportedMajor: MIN_SUPPORTED_POSTGRES_MAJOR,
                probeError: messageFromError(error),
            },
        };
    }
};

const activityChecks = async (
    probe: PreflightProbe,
    tables: string[],
): Promise<[HeldLocksCheck, LongTransactionsCheck]> => {
    try {
        const activity = (await probe.getRelationActivity(tables)).sort(
            (left, right) =>
                left.table.localeCompare(right.table) || left.pid - right.pid,
        );
        const longTransactions = activity.filter(
            (row) =>
                (row.transactionAgeSeconds ?? 0) >=
                LONG_TRANSACTION_THRESHOLD_SECONDS,
        );
        return [
            {
                id: 'held-locks',
                severity: 'yellow',
                outcome: activity.length > 0 ? 'warn' : 'pass',
                message:
                    activity.length > 0
                        ? `${activity.length} held relation lock(s) may delay DDL on pending-migration tables`
                        : 'No other sessions hold relation locks on pending-migration DDL tables',
                data: { tables, locks: activity, probeError: null },
            },
            {
                id: 'long-transactions',
                severity: 'yellow',
                outcome: longTransactions.length > 0 ? 'warn' : 'pass',
                message:
                    longTransactions.length > 0
                        ? `${longTransactions.length} long-running transaction(s) hold locks on pending-migration DDL tables`
                        : 'No long-running transactions hold locks on pending-migration DDL tables',
                data: {
                    thresholdSeconds: LONG_TRANSACTION_THRESHOLD_SECONDS,
                    transactions: longTransactions,
                    probeError: null,
                },
            },
        ];
    } catch (error) {
        const probeError = messageFromError(error);
        return [
            {
                id: 'held-locks',
                severity: 'yellow',
                outcome: 'warn',
                message: `Held locks could not be inspected: ${probeError}`,
                data: { tables, locks: [], probeError },
            },
            {
                id: 'long-transactions',
                severity: 'yellow',
                outcome: 'warn',
                message: `Long-running transactions could not be inspected: ${probeError}`,
                data: {
                    thresholdSeconds: LONG_TRANSACTION_THRESHOLD_SECONDS,
                    transactions: [],
                    probeError,
                },
            },
        ];
    }
};

const diskHeadroomCheck = async (
    probe: PreflightProbe,
    applicable: boolean,
): Promise<DiskHeadroomCheck> => {
    if (!applicable) {
        return {
            id: 'disk-headroom',
            severity: 'yellow',
            outcome: 'pass',
            message:
                'Disk headroom is not applicable because no pending artifact migration scans or rewrites a table',
            data: {
                applicable: false,
                availableBytes: null,
                minimumBytes: MIN_DISK_HEADROOM_BYTES,
                source: 'unavailable',
            },
        };
    }
    try {
        const result = await probe.getDiskHeadroom();
        const sufficient =
            result.availableBytes !== null &&
            result.availableBytes >= MIN_DISK_HEADROOM_BYTES;
        let message = 'Configured disk headroom is below the preflight minimum';
        if (result.availableBytes === null) {
            message =
                'Disk headroom is unavailable from PostgreSQL without an external capacity signal';
        } else if (sufficient) {
            message = 'Configured disk headroom is above the preflight minimum';
        }
        return {
            id: 'disk-headroom',
            severity: 'yellow',
            outcome: sufficient ? 'pass' : 'warn',
            message,
            data: {
                applicable: true,
                availableBytes: result.availableBytes,
                minimumBytes: MIN_DISK_HEADROOM_BYTES,
                source: result.source,
            },
        };
    } catch {
        return {
            id: 'disk-headroom',
            severity: 'yellow',
            outcome: 'warn',
            message:
                'Disk headroom is unavailable from PostgreSQL without an external capacity signal',
            data: {
                applicable: true,
                availableBytes: null,
                minimumBytes: MIN_DISK_HEADROOM_BYTES,
                source: 'unavailable',
            },
        };
    }
};

const pendingMigrationsCheck = (
    inventory: PendingMigrationInventoryItem[],
): PendingMigrationsCheck => ({
    id: 'pending-migrations',
    severity: 'info',
    outcome: 'info',
    message: `${inventory.length} pending migration(s)`,
    data: { migrations: inventory },
});

export const runPreflight = async ({
    artifactLoad,
    migrationState,
    inventory,
    probe,
    options,
}: PreflightInput): Promise<PreflightReport> => {
    const ddlTables = [
        ...new Set(
            (artifactLoad.artifact?.migrations.files ?? [])
                .filter(
                    (migration) =>
                        migrationState.pending.some(
                            (pendingMigration) =>
                                normalizeMigrationName(pendingMigration) ===
                                normalizeMigrationName(migration.name),
                        ) && migration.heaviness.locksTable !== false,
                )
                .flatMap((migration) => migration.tables),
        ),
    ].sort();
    const allTables = [
        ...new Set(inventory.flatMap((migration) => migration.tables)),
    ].sort();
    const diskHeadroomApplicable = (
        artifactLoad.artifact?.migrations.files ?? []
    ).some(
        (migration) =>
            migrationState.pending.some(
                (pendingMigration) =>
                    normalizeMigrationName(pendingMigration) ===
                    normalizeMigrationName(migration.name),
            ) &&
            (migration.heaviness.scansTable !== false ||
                migration.heaviness.rewritesTable !== false),
    );
    const [privileges, postgresVersion, activity, diskHeadroom] =
        await Promise.all([
            migrationPrivilegesCheck(probe, allTables),
            postgresVersionCheck(probe),
            activityChecks(probe, ddlTables),
            diskHeadroomCheck(probe, diskHeadroomApplicable),
        ]);
    const checks: PreflightCheck[] = [
        versionPathCheck(artifactLoad, migrationState),
        privileges,
        postgresVersion,
        activity[0],
        activity[1],
        diskHeadroom,
        pendingMigrationsCheck(inventory),
    ];
    const red = checks.filter(
        (check) => check.severity === 'red' && check.outcome === 'fail',
    ).length;
    const yellow = checks.filter(
        (check) => check.severity === 'yellow' && check.outcome === 'warn',
    ).length;
    const info = checks.filter((check) => check.severity === 'info').length;
    const shouldAbort = red > 0 || (options.strict && yellow > 0);
    let decision: PreflightReport['decision'] = 'proceed';
    if (shouldAbort) {
        decision = options.force ? 'force-proceed' : 'abort';
    } else if (yellow > 0) {
        decision = 'proceed-with-warnings';
    }
    return {
        schemaVersion: '1',
        decision,
        force: options.force,
        strict: options.strict,
        summary: { red, yellow, info },
        checks,
    };
};

export const renderPreflightReport = (report: PreflightReport): string => {
    const lines = report.checks.map(
        (check) =>
            `[${check.severity.toUpperCase()} ${check.outcome.toUpperCase()}] ${check.id}: ${check.message}`,
    );
    lines.push(
        `Preflight decision: ${report.decision} (${report.summary.red} red, ${report.summary.yellow} yellow)`,
    );
    return lines.join('\n');
};

export const parseDiskHeadroomBytes = (
    value: string | undefined,
): number | null => {
    if (value === undefined || value.length === 0) {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(
            'MIGRATION_PREFLIGHT_DISK_HEADROOM_BYTES must be a non-negative safe integer',
        );
    }
    return parsed;
};

export const createKnexPreflightProbe = ({
    database,
    diskHeadroomBytes,
}: {
    database: Knex;
    diskHeadroomBytes: number | null;
}): PreflightProbe => ({
    getPostgresVersion: async () => {
        const result = await database.raw<RawPostgresVersionResult>(
            `SELECT current_setting('server_version') AS server_version,
                    current_setting('server_version_num')::integer AS server_version_num`,
        );
        const row = result.rows[0];
        if (row === undefined) {
            throw new Error('PostgreSQL returned no version row');
        }
        return {
            serverVersion: row.server_version,
            serverVersionNum: Number(row.server_version_num),
        };
    },
    getMigrationPrivileges: async (tables) => {
        const privileges = await database.raw<RawMigrationPrivilegesResult>(
            `SELECT current_schema() AS schema_name,
                    has_schema_privilege(current_user, current_schema(), 'USAGE')
                    AND has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create_in_schema`,
        );
        const row = privileges.rows[0];
        if (row === undefined) {
            throw new Error('PostgreSQL returned no privilege row');
        }
        const ownership = await database.raw<RawUnownedTablesResult>(
            `SELECT pg_class.relname AS table_name
             FROM pg_class
             JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
             WHERE pg_namespace.nspname = current_schema()
               AND pg_class.relkind IN ('r', 'p')
               AND pg_class.relname = ANY(?::text[])
               AND NOT pg_has_role(current_user, pg_class.relowner, 'USAGE')
             ORDER BY pg_class.relname`,
            [tables],
        );
        return {
            schemaName: row.schema_name,
            canCreateInSchema: row.can_create_in_schema,
            unownedTables: ownership.rows.map((item) => item.table_name),
        };
    },
    getRelationActivity: async (tables) => {
        if (tables.length === 0) {
            return [];
        }
        const result = await database.raw<RawRelationActivityResult>(
            `SELECT DISTINCT pg_locks.pid,
                    pg_class.relname AS table_name,
                    pg_locks.mode AS lock_mode,
                    EXTRACT(EPOCH FROM clock_timestamp() - pg_stat_activity.xact_start)::integer AS transaction_age_seconds
             FROM pg_locks
             JOIN pg_class ON pg_class.oid = pg_locks.relation
             JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
             LEFT JOIN pg_stat_activity ON pg_stat_activity.pid = pg_locks.pid
             WHERE pg_locks.locktype = 'relation'
               AND pg_locks.granted = true
               AND pg_locks.pid <> pg_backend_pid()
               AND pg_namespace.nspname = current_schema()
               AND pg_class.relname = ANY(?::text[])
             ORDER BY pg_class.relname, pg_locks.pid, pg_locks.mode`,
            [tables],
        );
        return result.rows.map((row) => ({
            pid: Number(row.pid),
            table: row.table_name,
            lockMode: row.lock_mode,
            transactionAgeSeconds:
                row.transaction_age_seconds === null
                    ? null
                    : Number(row.transaction_age_seconds),
        }));
    },
    getDiskHeadroom: async () => ({
        availableBytes: diskHeadroomBytes,
        source: diskHeadroomBytes === null ? 'unavailable' : 'configured',
    }),
});
