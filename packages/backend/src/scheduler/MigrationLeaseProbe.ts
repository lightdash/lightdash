import type { WorkerUtils } from 'graphile-worker';
import { DatabaseError } from 'pg';

const MIGRATION_LEASE_EXPIRY_MS = 75_000;
const UNDEFINED_TABLE_ERROR_CODE = '42P01';

type MigrationLeaseProbeRow = {
    active: boolean;
};

type MigrationLeaseProbeArguments = {
    graphileUtils: Promise<Pick<WorkerUtils, 'withPgClient'>>;
    cacheMs: number;
    now?: () => number;
};

type MigrationLeaseProbeOptions = {
    refresh?: boolean;
};

export interface MigrationLeaseStatusProbe {
    isActive(options?: MigrationLeaseProbeOptions): Promise<boolean>;
}

export class MigrationLeaseProbe implements MigrationLeaseStatusProbe {
    private readonly graphileUtils: Promise<Pick<WorkerUtils, 'withPgClient'>>;

    private readonly cacheMs: number;

    private readonly now: () => number;

    private cachedResult: { active: boolean; expiresAt: number } | null = null;

    private pendingResult: Promise<boolean> | null = null;

    constructor({
        graphileUtils,
        cacheMs,
        now = Date.now,
    }: MigrationLeaseProbeArguments) {
        this.graphileUtils = graphileUtils;
        this.cacheMs = cacheMs;
        this.now = now;
    }

    async isActive({
        refresh = false,
    }: MigrationLeaseProbeOptions = {}): Promise<boolean> {
        if (
            !refresh &&
            this.cachedResult !== null &&
            this.cachedResult.expiresAt > this.now()
        ) {
            return this.cachedResult.active;
        }

        if (this.pendingResult !== null) {
            return this.pendingResult;
        }

        this.pendingResult = this.readLease().then((active) => {
            this.cachedResult = {
                active,
                expiresAt: this.now() + this.cacheMs,
            };
            return active;
        });

        try {
            return await this.pendingResult;
        } finally {
            this.pendingResult = null;
        }
    }

    private async readLease(): Promise<boolean> {
        try {
            const graphileUtils = await this.graphileUtils;
            const result = await graphileUtils.withPgClient((client) =>
                client.query<MigrationLeaseProbeRow>(
                    `SELECT COALESCE(
                        (
                            SELECT claim_token IS NOT NULL
                                AND last_heartbeat > CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
                            FROM migration_lease
                            WHERE lease_key = 'global'
                        ),
                        false
                    ) AS active`,
                    [MIGRATION_LEASE_EXPIRY_MS],
                ),
            );
            return result.rows[0]?.active ?? false;
        } catch (error) {
            if (
                error instanceof DatabaseError &&
                error.code === UNDEFINED_TABLE_ERROR_CODE
            ) {
                return false;
            }
            throw error;
        }
    }
}
