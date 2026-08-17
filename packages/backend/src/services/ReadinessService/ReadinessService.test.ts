import type { MigrationLeaseManager } from '../../database/migrationLease';
import Logger from '../../logging/logger';
import type { MigrationModel } from '../../models/MigrationModel/MigrationModel';
import { ReadinessService } from './ReadinessService';

const createDependencies = () => {
    const migrationModel: Pick<MigrationModel, 'getMigrationStatus'> = {
        getMigrationStatus: vi.fn(async () => ({
            status: 0,
            currentVersion: '20260811122500',
        })),
    };
    const migrationRunLedger: Pick<MigrationLeaseManager, 'readRunHistory'> = {
        readRunHistory: vi.fn(async () => ({
            initialized: true as const,
            runs: [],
        })),
    };
    return { migrationModel, migrationRunLedger };
};

describe('ReadinessService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns ready when the schema and migration ledger are healthy', async () => {
        const dependencies = createDependencies();
        const service = new ReadinessService({
            ...dependencies,
            ttlMs: 10_000,
        });

        await expect(service.getReadiness()).resolves.toEqual({
            status: 'ready',
        });
    });

    it('returns schema_pending without reading the ledger', async () => {
        const dependencies = createDependencies();
        vi.mocked(
            dependencies.migrationModel.getMigrationStatus,
        ).mockResolvedValue({ status: -1, currentVersion: '20260811122500' });
        const service = new ReadinessService({
            ...dependencies,
            ttlMs: 10_000,
        });

        await expect(service.getReadiness()).resolves.toEqual({
            status: 'not_ready',
            reason: 'schema_pending',
        });
        expect(
            dependencies.migrationRunLedger.readRunHistory,
        ).not.toHaveBeenCalled();
    });

    it('returns ready with a warning for the latest parked run', async () => {
        const dependencies = createDependencies();
        vi.mocked(
            dependencies.migrationRunLedger.readRunHistory,
        ).mockResolvedValue({
            initialized: true,
            runs: [
                {
                    runUuid: 'run-uuid',
                    claimToken: 'claim-token',
                    holderHostname: 'hostname',
                    holderPodName: null,
                    appVersion: '1.0.0',
                    fromMigration: null,
                    toMigration: '20260811122500',
                    attempt: 1,
                    startedAt: new Date('2026-08-11T10:00:00Z'),
                    finishedAt: new Date('2026-08-11T10:01:00Z'),
                    outcome: 'parked',
                    failingMigration: '20260811122500',
                    failureDetail: 'failed',
                    lastUnlockedBy: null,
                    lastUnlockedAt: null,
                    lastUnlockForced: false,
                },
            ],
        });
        const service = new ReadinessService({
            ...dependencies,
            ttlMs: 10_000,
        });

        await expect(service.getReadiness()).resolves.toEqual({
            status: 'ready',
            warnings: ['migration_parked'],
        });
    });

    it('returns ready with a warning and logs when the migration ledger is unavailable', async () => {
        const dependencies = createDependencies();
        vi.mocked(
            dependencies.migrationRunLedger.readRunHistory,
        ).mockResolvedValue({
            initialized: false,
            runs: [],
        });
        const loggerWarn = vi
            .spyOn(Logger, 'warn')
            .mockImplementation(() => Logger);
        const service = new ReadinessService({
            ...dependencies,
            ttlMs: 10_000,
        });

        await expect(service.getReadiness()).resolves.toEqual({
            status: 'ready',
            warnings: ['migration_ledger_unavailable'],
        });
        expect(loggerWarn).toHaveBeenCalledWith(
            'Migration run ledger is unavailable; readiness remains ready',
        );
    });

    it('returns db_unavailable when the readiness round cannot query the database', async () => {
        const dependencies = createDependencies();
        vi.mocked(
            dependencies.migrationModel.getMigrationStatus,
        ).mockRejectedValue(new Error('pool exhausted'));
        const service = new ReadinessService({
            ...dependencies,
            ttlMs: 10_000,
        });

        await expect(service.getReadiness()).resolves.toEqual({
            status: 'not_ready',
            reason: 'db_unavailable',
        });
    });

    it('shares one cold readiness round and caches the composed verdict for the TTL', async () => {
        let now = 1_000;
        let resolveMigrationStatus:
            | ((value: { status: number; currentVersion: string }) => void)
            | undefined;
        const migrationStatus = new Promise<{
            status: number;
            currentVersion: string;
        }>((resolve) => {
            resolveMigrationStatus = resolve;
        });
        const dependencies = createDependencies();
        vi.mocked(
            dependencies.migrationModel.getMigrationStatus,
        ).mockReturnValueOnce(migrationStatus);
        const service = new ReadinessService({
            ...dependencies,
            ttlMs: 10_000,
            now: () => now,
        });

        const probes = Array.from({ length: 20 }, () => service.getReadiness());
        expect(
            dependencies.migrationModel.getMigrationStatus,
        ).toHaveBeenCalledTimes(1);
        resolveMigrationStatus?.({
            status: 0,
            currentVersion: '20260811122500',
        });
        await expect(Promise.all(probes)).resolves.toEqual(
            Array.from({ length: 20 }, () => ({ status: 'ready' })),
        );

        await service.getReadiness();
        expect(
            dependencies.migrationModel.getMigrationStatus,
        ).toHaveBeenCalledTimes(1);
        expect(
            dependencies.migrationRunLedger.readRunHistory,
        ).toHaveBeenCalledTimes(1);

        now += 10_001;
        await service.getReadiness();
        expect(
            dependencies.migrationModel.getMigrationStatus,
        ).toHaveBeenCalledTimes(2);
        expect(
            dependencies.migrationRunLedger.readRunHistory,
        ).toHaveBeenCalledTimes(2);
    });
});
