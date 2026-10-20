import {
    DBT_SOURCE_FETCH_DISK_RESERVE_BYTES,
    resolveDbtSourceFetchConcurrency,
} from './dbtSourceFetchConcurrency';

const GIB = 1024 * 1024 * 1024;

const runtime = (cores: number, memoryBytes: number | undefined) => ({
    availableParallelism: () => cores,
    constrainedMemory: () => memoryBytes,
    statfs: () => {
        throw new Error('unknown');
    },
});

describe('resolveDbtSourceFetchConcurrency', () => {
    it('uses cores when memory is unconstrained', () => {
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            runtime(4, undefined),
        );
        expect(result.chosen).toEqual(4);
        expect(result.memoryDerivedLimit).toBeNull();
    });

    it('caps at eight however many cores are reported', () => {
        expect(
            resolveDbtSourceFetchConcurrency(undefined, runtime(64, undefined))
                .chosen,
        ).toEqual(8);
    });

    it('takes the memory bound when it is lower than cores', () => {
        // 8 GiB - 3 GiB reserve = 5 GiB, at 1 GiB per source
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            runtime(8, 8 * GIB),
        );
        expect(result.memoryDerivedLimit).toEqual(5);
        expect(result.chosen).toEqual(5);
    });

    it('takes the core bound when it is lower than memory', () => {
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            runtime(2, 32 * GIB),
        );
        expect(result.memoryDerivedLimit).toEqual(29);
        expect(result.chosen).toEqual(2);
    });

    it('floors the memory bound at two, however small the limit', () => {
        // Below 1 buys no memory: at every concurrency at or below 4 the peak already sits
        // after the fetch phase, so 1 costs wall clock and saves nothing.
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            runtime(8, 2 * GIB),
        );
        // reported raw, before the floor, so the sizing arithmetic stays legible
        expect(result.memoryDerivedLimit).toBeLessThanOrEqual(0);
        expect(result.chosen).toEqual(2);
    });

    it('lets a single core still serialise', () => {
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            runtime(1, 32 * GIB),
        );
        expect(result.chosen).toEqual(1);
    });

    it('does not let the memory floor override the core bound', () => {
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            runtime(1, 2 * GIB),
        );
        expect(result.memoryDerivedLimit).toBeLessThanOrEqual(0);
        expect(result.chosen).toEqual(1);
    });

    it('lets the override win over both bounds', () => {
        const result = resolveDbtSourceFetchConcurrency(
            14,
            runtime(2, 4 * GIB),
        );
        expect(result.chosen).toEqual(14);
        expect(result.override).toEqual(14);
    });

    it('clamps a non-positive override to one', () => {
        expect(
            resolveDbtSourceFetchConcurrency(0, runtime(8, undefined)).chosen,
        ).toEqual(1);
    });

    it('reports every input that produced the decision', () => {
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            runtime(8, 8 * GIB),
        );
        expect(result).toEqual({
            override: undefined,
            availableParallelism: 8,
            constrainedMemoryBytes: 8 * GIB,
            memoryDerivedLimit: 5,
            diskAvailableBytes: null,
            diskBudgetSource: 'unknown',
            diskDerivedLimit: null,
            chosen: 5,
        });
    });
});

describe('disk concurrency bound', () => {
    it('uses the explicit budget before querying the filesystem', () => {
        const statfs = vi.fn(() => ({ bavail: 1000, bsize: GIB }));
        const result = resolveDbtSourceFetchConcurrency(
            undefined,
            {
                ...runtime(8, undefined),
                statfs,
            },
            {
                sourceFetchDiskBudgetBytes:
                    DBT_SOURCE_FETCH_DISK_RESERVE_BYTES + 3 * 256 * 1024 ** 2,
            },
        );
        expect(result).toMatchObject({
            diskBudgetSource: 'env',
            diskDerivedLimit: 3,
            chosen: 3,
        });
        expect(statfs).not.toHaveBeenCalled();
    });
    it('uses available blocks from statfs', () => {
        const result = resolveDbtSourceFetchConcurrency(undefined, {
            ...runtime(8, undefined),
            statfs: () => ({ bavail: 3, bsize: GIB }),
        });
        expect(result).toMatchObject({
            diskAvailableBytes: 3 * GIB,
            diskBudgetSource: 'statfs',
            diskDerivedLimit: 3,
            chosen: 3,
        });
    });
    it('keeps the existing bound when statfs fails', () => {
        expect(
            resolveDbtSourceFetchConcurrency(undefined, runtime(8, undefined)),
        ).toMatchObject({
            diskAvailableBytes: null,
            diskBudgetSource: 'unknown',
            diskDerivedLimit: null,
            chosen: 8,
        });
    });
    it('lets an override win over a disk budget', () => {
        expect(
            resolveDbtSourceFetchConcurrency(8, runtime(8, undefined), {
                sourceFetchDiskBudgetBytes: 1,
            }).chosen,
        ).toBe(8);
    });
    it('floors at one even when the reserve exceeds the budget', () => {
        expect(
            resolveDbtSourceFetchConcurrency(undefined, runtime(8, undefined), {
                sourceFetchDiskBudgetBytes: GIB,
            }),
        ).toMatchObject({ diskDerivedLimit: 1, chosen: 1 });
    });
    it('uses the configured per-source estimate', () => {
        expect(
            resolveDbtSourceFetchConcurrency(undefined, runtime(8, undefined), {
                sourceFetchDiskBudgetBytes:
                    DBT_SOURCE_FETCH_DISK_RESERVE_BYTES + GIB,
                sourceFetchDiskPerSourceBytes: GIB / 2,
            }).chosen,
        ).toBe(2);
    });
});
