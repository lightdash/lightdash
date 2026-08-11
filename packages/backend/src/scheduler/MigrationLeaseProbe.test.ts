import type { WorkerUtils } from 'graphile-worker';
import { DatabaseError } from 'pg';
import { MigrationLeaseProbe } from './MigrationLeaseProbe';

const makeGraphileUtils = (query: import('vitest').Mock) =>
    Promise.resolve({
        withPgClient: vi.fn(async (callback) => callback({ query } as never)),
    } as Pick<WorkerUtils, 'withPgClient'>);

describe('MigrationLeaseProbe', () => {
    it('reports a fresh claimed lease as active and caches the indexed read', async () => {
        let now = 1_000;
        const query = vi.fn().mockResolvedValue({ rows: [{ active: true }] });
        const probe = new MigrationLeaseProbe({
            graphileUtils: makeGraphileUtils(query),
            cacheMs: 2_000,
            now: () => now,
        });

        await expect(probe.isActive()).resolves.toBe(true);
        now = 2_000;
        await expect(probe.isActive()).resolves.toBe(true);

        expect(query).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining('FROM migration_lease'),
            [75_000],
        );
    });

    it('refreshes an expired cached result', async () => {
        let now = 1_000;
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ active: true }] })
            .mockResolvedValueOnce({ rows: [{ active: false }] });
        const probe = new MigrationLeaseProbe({
            graphileUtils: makeGraphileUtils(query),
            cacheMs: 2_000,
            now: () => now,
        });

        await expect(probe.isActive()).resolves.toBe(true);
        now = 3_001;
        await expect(probe.isActive()).resolves.toBe(false);

        expect(query).toHaveBeenCalledTimes(2);
    });

    it('treats a pre-lease database as having no active lease', async () => {
        const error = new DatabaseError('relation does not exist', 0, 'error');
        error.code = '42P01';
        const query = vi.fn().mockRejectedValue(error);
        const probe = new MigrationLeaseProbe({
            graphileUtils: makeGraphileUtils(query),
            cacheMs: 2_000,
        });

        await expect(probe.isActive()).resolves.toBe(false);
    });
});
