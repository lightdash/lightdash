import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { MIGRATION_LEASE_SCHEMA_SQL } from './migrationLeaseSchema';
import { MIGRATION_RUN_LEDGER_SCHEMA_SQL } from './migrationRunLedgerSchema';

export const MIGRATION_LEASE_TABLE_NAME = 'migration_lease';
export const MIGRATION_RUN_LEDGER_TABLE_NAME = 'migration_run_ledger';
export const MIGRATION_LEASE_KEY = 'global';
export const MIGRATION_LEASE_EXPIRY_MS = 75_000;

const BOOTSTRAP_MAX_ATTEMPTS = 10;
const BOOTSTRAP_RETRY_DELAY_MS = 50;
const UNLOCK_MAX_ATTEMPTS = 3;
const UUID_EXTENSION_SQL = 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"';
const RETRYABLE_BOOTSTRAP_ERROR_CODES = new Set(['23505', '42P07']);

const LEGACY_LEASE_COLUMNS = [
    'lease_key',
    'holder_hostname',
    'holder_pod_name',
    'app_version',
    'claim_token',
    'started_at',
    'current_migration',
    'last_heartbeat',
    'last_unlocked_by',
    'last_unlocked_at',
] as const;

const LEASE_COLUMNS = [
    ...LEGACY_LEASE_COLUMNS,
    'last_unlock_forced',
    'parked_at',
    'parked_app_version',
    'parked_migration',
    'parked_error',
    'parked_run_uuid',
] as const;

const RUN_COLUMNS = [
    'migration_run_uuid',
    'claim_token',
    'holder_hostname',
    'holder_pod_name',
    'app_version',
    'from_migration',
    'to_migration',
    'attempt',
    'started_at',
    'finished_at',
    'outcome',
    'failing_migration',
    'failure_detail',
    'last_unlocked_by',
    'last_unlocked_at',
    'last_unlock_forced',
] as const;

type MigrationLeaseDatabaseRow = {
    lease_key: string;
    holder_hostname: string | null;
    holder_pod_name: string | null;
    app_version: string | null;
    claim_token: string | null;
    started_at: Date | null;
    current_migration: string | null;
    last_heartbeat: Date | null;
    last_unlocked_by: string | null;
    last_unlocked_at: Date | null;
    last_unlock_forced?: boolean;
    parked_at?: Date | null;
    parked_app_version?: string | null;
    parked_migration?: string | null;
    parked_error?: string | null;
    parked_run_uuid?: string | null;
};

type MigrationLeaseStatusDatabaseRow = MigrationLeaseDatabaseRow & {
    expired: boolean;
};

export type MigrationLeaseIdentity = {
    hostname: string;
    podName: string | null;
    appVersion: string;
};

export type MigrationLease = {
    key: string;
    holderHostname: string | null;
    holderPodName: string | null;
    appVersion: string | null;
    claimToken: string | null;
    startedAt: Date | null;
    currentMigration: string | null;
    lastHeartbeat: Date | null;
    lastUnlockedBy: string | null;
    lastUnlockedAt: Date | null;
    lastUnlockForced: boolean;
    parkedAt: Date | null;
    parkedAppVersion: string | null;
    parkedMigration: string | null;
    parkedError: string | null;
    parkedRunUuid: string | null;
    expired: boolean;
};

export type MigrationRunOutcome =
    | 'running'
    | 'succeeded'
    | 'retrying'
    | 'parked';

type MigrationRunDatabaseRow = {
    migration_run_uuid: string;
    claim_token: string;
    holder_hostname: string;
    holder_pod_name: string | null;
    app_version: string;
    from_migration: string | null;
    to_migration: string | null;
    attempt: number;
    started_at: Date;
    finished_at: Date | null;
    outcome: MigrationRunOutcome;
    failing_migration: string | null;
    failure_detail: string | null;
    last_unlocked_by: string | null;
    last_unlocked_at: Date | null;
    last_unlock_forced: boolean;
};

export type MigrationRun = {
    runUuid: string;
    claimToken: string;
    holderHostname: string;
    holderPodName: string | null;
    appVersion: string;
    fromMigration: string | null;
    toMigration: string | null;
    attempt: number;
    startedAt: Date;
    finishedAt: Date | null;
    outcome: MigrationRunOutcome;
    failingMigration: string | null;
    failureDetail: string | null;
    lastUnlockedBy: string | null;
    lastUnlockedAt: Date | null;
    lastUnlockForced: boolean;
};

export type MigrationRunHistoryReadResult =
    | {
          initialized: false;
          runs: [];
      }
    | {
          initialized: true;
          runs: MigrationRun[];
      };

export type MigrationRunStart = {
    token: string;
    identity: MigrationLeaseIdentity;
    fromMigration: string | null;
    toMigration: string | null;
    attempt: number;
    lastUnlockedBy: string | null;
    lastUnlockedAt: Date | null;
    lastUnlockForced: boolean;
};

export type MigrationLeaseReadResult =
    | {
          initialized: false;
          lease: null;
      }
    | {
          initialized: true;
          lease: MigrationLease | null;
      };

export type MigrationLeaseClaimResult =
    | {
          status: 'acquired';
          token: string;
          lease: MigrationLease;
      }
    | {
          status: 'held';
          token: null;
          lease: MigrationLease;
      };

export type MigrationLeaseUnlockResult =
    | {
          status: 'unlocked';
          lease: MigrationLease;
      }
    | {
          status: 'held';
          lease: MigrationLease;
      };

type MigrationLeaseManagerArguments = {
    database: Knex;
    expiryMs?: number;
    tokenFactory?: () => string;
    runIdFactory?: () => string;
    bootstrapDelay?: (durationMs: number) => Promise<void>;
};

const delay = async (durationMs: number): Promise<void> => {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
    });
};

const isRetryableBootstrapError = (error: unknown): boolean =>
    error instanceof DatabaseError &&
    error.code !== undefined &&
    RETRYABLE_BOOTSTRAP_ERROR_CODES.has(error.code);

const mapLease = (
    row: MigrationLeaseDatabaseRow,
    expired: boolean,
): MigrationLease => ({
    key: row.lease_key,
    holderHostname: row.holder_hostname,
    holderPodName: row.holder_pod_name,
    appVersion: row.app_version,
    claimToken: row.claim_token,
    startedAt: row.started_at,
    currentMigration: row.current_migration,
    lastHeartbeat: row.last_heartbeat,
    lastUnlockedBy: row.last_unlocked_by,
    lastUnlockedAt: row.last_unlocked_at,
    lastUnlockForced: row.last_unlock_forced ?? false,
    parkedAt: row.parked_at ?? null,
    parkedAppVersion: row.parked_app_version ?? null,
    parkedMigration: row.parked_migration ?? null,
    parkedError: row.parked_error ?? null,
    parkedRunUuid: row.parked_run_uuid ?? null,
    expired,
});

const mapRun = (row: MigrationRunDatabaseRow): MigrationRun => ({
    runUuid: row.migration_run_uuid,
    claimToken: row.claim_token,
    holderHostname: row.holder_hostname,
    holderPodName: row.holder_pod_name,
    appVersion: row.app_version,
    fromMigration: row.from_migration,
    toMigration: row.to_migration,
    attempt: row.attempt,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    outcome: row.outcome,
    failingMigration: row.failing_migration,
    failureDetail: row.failure_detail,
    lastUnlockedBy: row.last_unlocked_by,
    lastUnlockedAt: row.last_unlocked_at,
    lastUnlockForced: row.last_unlock_forced,
});

export class MigrationLeaseManager {
    private readonly database: Knex;

    private readonly expiryMs: number;

    private readonly tokenFactory: () => string;

    private readonly runIdFactory: () => string;

    private readonly bootstrapDelay: (durationMs: number) => Promise<void>;

    constructor({
        database,
        expiryMs = MIGRATION_LEASE_EXPIRY_MS,
        tokenFactory = randomUUID,
        runIdFactory = randomUUID,
        bootstrapDelay = delay,
    }: MigrationLeaseManagerArguments) {
        this.database = database;
        this.expiryMs = expiryMs;
        this.tokenFactory = tokenFactory;
        this.runIdFactory = runIdFactory;
        this.bootstrapDelay = bootstrapDelay;
    }

    async ensureSchema(): Promise<void> {
        await this.ensureSchemaAttempt(1);
    }

    private async ensureSchemaAttempt(attempt: number): Promise<void> {
        try {
            await this.database.raw(UUID_EXTENSION_SQL);
            await this.database.raw(MIGRATION_LEASE_SCHEMA_SQL);
            await this.database.raw(MIGRATION_RUN_LEDGER_SCHEMA_SQL);
        } catch (error) {
            if (
                !isRetryableBootstrapError(error) ||
                attempt === BOOTSTRAP_MAX_ATTEMPTS
            ) {
                throw error;
            }
            await this.bootstrapDelay(BOOTSTRAP_RETRY_DELAY_MS);
            await this.ensureSchemaAttempt(attempt + 1);
        }
    }

    private whereLeaseIsClaimable(query: Knex.QueryBuilder): void {
        query
            .whereNull('claim_token')
            .orWhereNull('last_heartbeat')
            .orWhere(
                'last_heartbeat',
                '<=',
                this.database.raw(
                    "CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond')",
                    [this.expiryMs],
                ),
            );
    }

    async claim(
        identity: MigrationLeaseIdentity,
    ): Promise<MigrationLeaseClaimResult> {
        await this.ensureSchema();
        const token = this.tokenFactory();
        const rows = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .where('lease_key', MIGRATION_LEASE_KEY)
            .andWhere((query) => this.whereLeaseIsClaimable(query))
            .andWhere((query) =>
                query
                    .whereNull('parked_at')
                    .orWhereNot('parked_app_version', identity.appVersion),
            )
            .update({
                holder_hostname: identity.hostname,
                holder_pod_name: identity.podName,
                app_version: identity.appVersion,
                claim_token: token,
                started_at: this.database.fn.now(),
                current_migration: null,
                last_heartbeat: this.database.fn.now(),
            })
            .returning(LEASE_COLUMNS)) as MigrationLeaseDatabaseRow[];

        const acquiredLease = rows[0];
        if (acquiredLease !== undefined) {
            return {
                status: 'acquired',
                token,
                lease: mapLease(acquiredLease, false),
            };
        }

        const current = await this.read();
        if (!current.initialized || current.lease === null) {
            throw new Error(
                'Migration lease row is unavailable after bootstrap',
            );
        }
        return {
            status: 'held',
            token: null,
            lease: current.lease,
        };
    }

    async heartbeat(token: string): Promise<boolean> {
        const rows = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .where({
                lease_key: MIGRATION_LEASE_KEY,
                claim_token: token,
            })
            .update({ last_heartbeat: this.database.fn.now() })
            .returning('lease_key')) as Array<{ lease_key: string }>;
        return rows.length === 1;
    }

    async setCurrentMigration(
        token: string,
        currentMigration: string | null,
    ): Promise<boolean> {
        const rows = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .where({
                lease_key: MIGRATION_LEASE_KEY,
                claim_token: token,
            })
            .update({ current_migration: currentMigration })
            .returning('lease_key')) as Array<{ lease_key: string }>;
        return rows.length === 1;
    }

    async release(token: string): Promise<boolean> {
        const rows = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .where({
                lease_key: MIGRATION_LEASE_KEY,
                claim_token: token,
            })
            .update({
                holder_hostname: null,
                holder_pod_name: null,
                app_version: null,
                claim_token: null,
                started_at: null,
                current_migration: null,
                last_heartbeat: null,
            })
            .returning('lease_key')) as Array<{ lease_key: string }>;
        return rows.length === 1;
    }

    async startRun(run: MigrationRunStart): Promise<string> {
        const runUuid = this.runIdFactory();
        const rows = (await this.database(MIGRATION_RUN_LEDGER_TABLE_NAME)
            .insert({
                migration_run_uuid: runUuid,
                claim_token: run.token,
                holder_hostname: run.identity.hostname,
                holder_pod_name: run.identity.podName,
                app_version: run.identity.appVersion,
                from_migration: run.fromMigration,
                to_migration: run.toMigration,
                attempt: run.attempt,
                outcome: 'running',
                last_unlocked_by: run.lastUnlockedBy,
                last_unlocked_at: run.lastUnlockedAt,
                last_unlock_forced: run.lastUnlockForced,
            })
            .returning('migration_run_uuid')) as Array<{
            migration_run_uuid: string;
        }>;
        const inserted = rows[0];
        if (inserted === undefined) {
            throw new Error('Migration run ledger row was not created');
        }
        return inserted.migration_run_uuid;
    }

    async recordRetry(
        token: string,
        runUuid: string,
        failingMigration: string,
        failureDetail: string,
    ): Promise<boolean> {
        const rows = (await this.database(MIGRATION_RUN_LEDGER_TABLE_NAME)
            .where({
                migration_run_uuid: runUuid,
                claim_token: token,
                outcome: 'running',
            })
            .update({
                outcome: 'retrying',
                finished_at: this.database.fn.now(),
                failing_migration: failingMigration,
                failure_detail: failureDetail,
            })
            .returning('migration_run_uuid')) as Array<{
            migration_run_uuid: string;
        }>;
        return rows.length === 1;
    }

    async completeRun(token: string, runUuid: string): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const runRows = (await transaction(MIGRATION_RUN_LEDGER_TABLE_NAME)
                .where({
                    migration_run_uuid: runUuid,
                    claim_token: token,
                    outcome: 'running',
                })
                .update({
                    outcome: 'succeeded',
                    finished_at: transaction.fn.now(),
                })
                .returning('migration_run_uuid')) as Array<{
                migration_run_uuid: string;
            }>;
            if (runRows.length !== 1) {
                return false;
            }
            const leaseRows = (await transaction(MIGRATION_LEASE_TABLE_NAME)
                .where({
                    lease_key: MIGRATION_LEASE_KEY,
                    claim_token: token,
                })
                .update({
                    holder_hostname: null,
                    holder_pod_name: null,
                    app_version: null,
                    claim_token: null,
                    started_at: null,
                    current_migration: null,
                    last_heartbeat: null,
                    parked_at: null,
                    parked_app_version: null,
                    parked_migration: null,
                    parked_error: null,
                    parked_run_uuid: null,
                })
                .returning('lease_key')) as Array<{ lease_key: string }>;
            if (leaseRows.length !== 1) {
                throw new Error('Migration lease was lost before completion');
            }
            return true;
        });
    }

    async parkRun(
        token: string,
        runUuid: string,
        appVersion: string,
        failingMigration: string,
        failureDetail: string,
    ): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const runRows = (await transaction(MIGRATION_RUN_LEDGER_TABLE_NAME)
                .where({
                    migration_run_uuid: runUuid,
                    claim_token: token,
                    outcome: 'running',
                })
                .update({
                    outcome: 'parked',
                    finished_at: transaction.fn.now(),
                    failing_migration: failingMigration,
                    failure_detail: failureDetail,
                })
                .returning('migration_run_uuid')) as Array<{
                migration_run_uuid: string;
            }>;
            if (runRows.length !== 1) {
                return false;
            }
            const leaseRows = (await transaction(MIGRATION_LEASE_TABLE_NAME)
                .where({
                    lease_key: MIGRATION_LEASE_KEY,
                    claim_token: token,
                })
                .update({
                    holder_hostname: null,
                    holder_pod_name: null,
                    app_version: null,
                    claim_token: null,
                    started_at: null,
                    current_migration: null,
                    last_heartbeat: null,
                    parked_at: transaction.fn.now(),
                    parked_app_version: appVersion,
                    parked_migration: failingMigration,
                    parked_error: failureDetail,
                    parked_run_uuid: runUuid,
                })
                .returning('lease_key')) as Array<{ lease_key: string }>;
            if (leaseRows.length !== 1) {
                throw new Error('Migration lease was lost before parking');
            }
            return true;
        });
    }

    async unlock(
        actor: string,
        force: boolean,
    ): Promise<MigrationLeaseUnlockResult> {
        await this.ensureSchema();
        return this.unlockAttempt(actor, force, 1);
    }

    private async unlockAttempt(
        actor: string,
        force: boolean,
        attempt: number,
    ): Promise<MigrationLeaseUnlockResult> {
        const query = this.database(MIGRATION_LEASE_TABLE_NAME).where(
            'lease_key',
            MIGRATION_LEASE_KEY,
        );
        if (!force) {
            query.andWhere((claimableQuery) =>
                this.whereLeaseIsClaimable(claimableQuery),
            );
        }
        const rows = (await query
            .update({
                holder_hostname: null,
                holder_pod_name: null,
                app_version: null,
                claim_token: null,
                started_at: null,
                current_migration: null,
                last_heartbeat: null,
                last_unlocked_by: actor,
                last_unlocked_at: this.database.fn.now(),
                last_unlock_forced: force,
                parked_at: null,
                parked_app_version: null,
                parked_migration: null,
                parked_error: null,
                parked_run_uuid: null,
            })
            .returning(LEASE_COLUMNS)) as MigrationLeaseDatabaseRow[];
        const lease = rows[0];
        if (lease !== undefined) {
            return {
                status: 'unlocked',
                lease: mapLease(lease, false),
            };
        }
        if (force) {
            throw new Error(
                'Migration lease row is unavailable after bootstrap',
            );
        }
        const current = await this.read();
        if (!current.initialized || current.lease === null) {
            throw new Error(
                'Migration lease row is unavailable after bootstrap',
            );
        }
        if (current.lease.claimToken === null || current.lease.expired) {
            if (attempt === UNLOCK_MAX_ATTEMPTS) {
                throw new Error(
                    'Migration lease changed repeatedly during unlock; retry the command',
                );
            }
            return this.unlockAttempt(actor, false, attempt + 1);
        }
        return {
            status: 'held',
            lease: current.lease,
        };
    }

    async read(): Promise<MigrationLeaseReadResult> {
        const initialized = await this.database.schema.hasTable(
            MIGRATION_LEASE_TABLE_NAME,
        );
        if (!initialized) {
            return { initialized: false, lease: null };
        }

        const ledgerInitialized = await this.database.schema.hasTable(
            MIGRATION_RUN_LEDGER_TABLE_NAME,
        );
        const leaseColumns = ledgerInitialized
            ? LEASE_COLUMNS
            : LEGACY_LEASE_COLUMNS;
        const row = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .select(leaseColumns)
            .select(
                this.database.raw(
                    `(claim_token IS NOT NULL AND (last_heartbeat IS NULL OR last_heartbeat <= CURRENT_TIMESTAMP - (? * INTERVAL '1 millisecond'))) AS expired`,
                    [this.expiryMs],
                ),
            )
            .where('lease_key', MIGRATION_LEASE_KEY)
            .first()) as MigrationLeaseStatusDatabaseRow | undefined;

        return {
            initialized: true,
            lease: row === undefined ? null : mapLease(row, row.expired),
        };
    }

    async readRunHistory(limit = 10): Promise<MigrationRunHistoryReadResult> {
        const initialized = await this.database.schema.hasTable(
            MIGRATION_RUN_LEDGER_TABLE_NAME,
        );
        if (!initialized) {
            return { initialized: false, runs: [] };
        }
        const rows = (await this.database(MIGRATION_RUN_LEDGER_TABLE_NAME)
            .select(RUN_COLUMNS)
            .orderBy('started_at', 'desc')
            .limit(limit)) as MigrationRunDatabaseRow[];
        return {
            initialized: true,
            runs: rows.map(mapRun),
        };
    }

    async readLastSucceededRun(): Promise<MigrationRun | null> {
        const initialized = await this.database.schema.hasTable(
            MIGRATION_RUN_LEDGER_TABLE_NAME,
        );
        if (!initialized) {
            return null;
        }
        const row = (await this.database(MIGRATION_RUN_LEDGER_TABLE_NAME)
            .select(RUN_COLUMNS)
            .where('outcome', 'succeeded')
            .orderBy('started_at', 'desc')
            .first()) as MigrationRunDatabaseRow | undefined;
        return row === undefined ? null : mapRun(row);
    }
}
