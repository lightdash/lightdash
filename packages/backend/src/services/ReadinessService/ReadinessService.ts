import type { MigrationLeaseManager } from '../../database/migrationLease';
import Logger from '../../logging/logger';
import type { MigrationModel } from '../../models/MigrationModel/MigrationModel';

export type ReadinessResult =
    | { status: 'ready' }
    | {
          status: 'not_ready';
          reason:
              | 'schema_pending'
              | 'migration_parked'
              | 'migration_ledger_unavailable'
              | 'db_unavailable';
      };

type ReadinessServiceArguments = {
    migrationModel: Pick<MigrationModel, 'getMigrationStatus'>;
    migrationRunLedger: Pick<MigrationLeaseManager, 'readRunHistory'>;
    ttlMs: number;
    now?: () => number;
};

export class ReadinessService {
    private readonly migrationModel: Pick<MigrationModel, 'getMigrationStatus'>;

    private readonly migrationRunLedger: Pick<
        MigrationLeaseManager,
        'readRunHistory'
    >;

    private readonly ttlMs: number;

    private readonly now: () => number;

    private cachedResult:
        | { expiresAt: number; result: ReadinessResult }
        | undefined;

    private inFlight: Promise<ReadinessResult> | undefined;

    constructor({
        migrationModel,
        migrationRunLedger,
        ttlMs,
        now = Date.now,
    }: ReadinessServiceArguments) {
        this.migrationModel = migrationModel;
        this.migrationRunLedger = migrationRunLedger;
        this.ttlMs = ttlMs;
        this.now = now;
    }

    async getReadiness(): Promise<ReadinessResult> {
        if (
            this.cachedResult !== undefined &&
            this.cachedResult.expiresAt > this.now()
        ) {
            return this.cachedResult.result;
        }

        if (this.inFlight !== undefined) {
            return this.inFlight;
        }

        this.inFlight = this.checkReadiness()
            .then((result) => {
                this.cachedResult = {
                    expiresAt: this.now() + this.ttlMs,
                    result,
                };
                return result;
            })
            .finally(() => {
                this.inFlight = undefined;
            });

        return this.inFlight;
    }

    private async checkReadiness(): Promise<ReadinessResult> {
        try {
            const migrationStatus =
                await this.migrationModel.getMigrationStatus();
            if (migrationStatus.status < 0) {
                return { status: 'not_ready', reason: 'schema_pending' };
            }

            const runHistory = await this.migrationRunLedger.readRunHistory(1);
            if (!runHistory.initialized) {
                return {
                    status: 'not_ready',
                    reason: 'migration_ledger_unavailable',
                };
            }
            if (runHistory.runs[0]?.outcome === 'parked') {
                return { status: 'not_ready', reason: 'migration_parked' };
            }

            return { status: 'ready' };
        } catch (error) {
            Logger.warn(
                `Readiness check failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return { status: 'not_ready', reason: 'db_unavailable' };
        }
    }
}
