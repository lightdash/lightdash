import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';

export const MIGRATION_LEASE_TABLE_NAME = 'migration_lease';
export const MIGRATION_LEASE_KEY = 'global';
export const MIGRATION_LEASE_EXPIRY_MS = 75_000;

export const BOOTSTRAP_MIGRATION_LEASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS migration_lease (
    lease_key text PRIMARY KEY,
    holder_hostname text,
    holder_pod_name text,
    app_version text,
    claim_token uuid,
    started_at timestamptz,
    current_migration text,
    last_heartbeat timestamptz,
    last_unlocked_by text,
    last_unlocked_at timestamptz,
    CONSTRAINT migration_lease_singleton_key CHECK (lease_key = 'global')
);

INSERT INTO migration_lease (lease_key)
VALUES ('global')
ON CONFLICT (lease_key) DO NOTHING;
`;

const BOOTSTRAP_MAX_ATTEMPTS = 10;
const BOOTSTRAP_RETRY_DELAY_MS = 50;
const RETRYABLE_BOOTSTRAP_ERROR_CODES = new Set(['23505', '42P07']);

const LEASE_COLUMNS = [
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
    expired: boolean;
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

type MigrationLeaseManagerArguments = {
    database: Knex;
    expiryMs?: number;
    tokenFactory?: () => string;
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
    expired,
});

export class MigrationLeaseManager {
    private readonly database: Knex;

    private readonly expiryMs: number;

    private readonly tokenFactory: () => string;

    private readonly bootstrapDelay: (durationMs: number) => Promise<void>;

    constructor({
        database,
        expiryMs = MIGRATION_LEASE_EXPIRY_MS,
        tokenFactory = randomUUID,
        bootstrapDelay = delay,
    }: MigrationLeaseManagerArguments) {
        this.database = database;
        this.expiryMs = expiryMs;
        this.tokenFactory = tokenFactory;
        this.bootstrapDelay = bootstrapDelay;
    }

    async ensureSchema(): Promise<void> {
        await this.ensureSchemaAttempt(1);
    }

    private async ensureSchemaAttempt(attempt: number): Promise<void> {
        try {
            await this.database.raw(BOOTSTRAP_MIGRATION_LEASE_SCHEMA_SQL);
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

    async claim(
        identity: MigrationLeaseIdentity,
    ): Promise<MigrationLeaseClaimResult> {
        await this.ensureSchema();
        const token = this.tokenFactory();
        const rows = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .where('lease_key', MIGRATION_LEASE_KEY)
            .andWhere((query) =>
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
                    ),
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

    async unlock(actor: string): Promise<MigrationLease> {
        await this.ensureSchema();
        const rows = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .where('lease_key', MIGRATION_LEASE_KEY)
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
            })
            .returning(LEASE_COLUMNS)) as MigrationLeaseDatabaseRow[];
        const lease = rows[0];
        if (lease === undefined) {
            throw new Error(
                'Migration lease row is unavailable after bootstrap',
            );
        }
        return mapLease(lease, false);
    }

    async read(): Promise<MigrationLeaseReadResult> {
        const initialized = await this.database.schema.hasTable(
            MIGRATION_LEASE_TABLE_NAME,
        );
        if (!initialized) {
            return { initialized: false, lease: null };
        }

        const row = (await this.database(MIGRATION_LEASE_TABLE_NAME)
            .select(LEASE_COLUMNS)
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
}
