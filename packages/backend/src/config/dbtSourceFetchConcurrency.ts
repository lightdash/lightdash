import fs from 'fs';
import os from 'os';
import { getDbtPartialParseBaselineSize } from '../dbt/dbtPartialParseBaseline';

export const DBT_SOURCE_FETCH_MEMORY_RESERVE_BYTES = 3 * 1024 * 1024 * 1024;
export const DBT_SOURCE_FETCH_MEMORY_PER_SOURCE_BYTES = 1024 * 1024 * 1024;
export const DBT_SOURCE_FETCH_MAX_CONCURRENCY = 8;
/**
 * The memory bound never drops below this. Measured: at every concurrency at or below 4 the peak
 * already sits after the fetch phase, so 1 has the same peak as 2 and only costs wall clock.
 * Without this floor any pod at or below 4 GiB would serialise every source parse for no gain.
 */
export const DBT_SOURCE_FETCH_MIN_MEMORY_CONCURRENCY = 2;

export const DBT_SOURCE_FETCH_DISK_PER_SOURCE_BYTES = 256 * 1024 ** 2;
export const DBT_SOURCE_FETCH_DISK_RESERVE_BYTES = 256 * 1024 ** 2;
export const DBT_SOURCE_FETCH_DEFAULT_DISK_CAPACITY = 8;

export type DbtSourceFetchDiskConfig = {
    sourceFetchDiskBudgetBytes?: number;
    sourceFetchDiskPerSourceBytes?: number;
};

export type DbtSourceFetchConcurrencyInputs = {
    override: number | undefined;
    availableParallelism: number;
    constrainedMemoryBytes: number | undefined;
    memoryDerivedLimit: number | null;
    diskAvailableBytes: number | null;
    diskBudgetSource: 'env' | 'statfs' | 'unknown';
    diskDerivedLimit: number | null;
    diskCapacity: number;
    chosen: number;
};

/**
 * How many dbt sources may be fetched at once.
 *
 * Bounded by cores and by memory, because each source runs its own dbt process whose memory is
 * additive to the Node heap. Concurrency above the CPU quota buys no wall clock — total dbt CPU
 * is fixed and the processes only time-slice — while memory rises linearly with it.
 *
 * The memory reserve is the measured Node save-path floor plus margin. The per-source figure is
 * an estimate for real repositories, measured at 251 MB against a fixture; it is the constant to
 * tighten with evidence from a real instance.
 *
 * The memory-derived bound floors at DBT_SOURCE_FETCH_MIN_MEMORY_CONCURRENCY; the core bound does
 * not, because a single-core pod genuinely cannot parallelise. `memoryDerivedLimit` is reported
 * raw, before the floor, so a support log still shows what the memory arithmetic produced.
 */
export const resolveDbtSourceFetchConcurrency = (
    override: number | undefined,
    // injectable for tests only
    runtime: {
        availableParallelism: () => number;
        constrainedMemory: () => number | undefined;
        statfs?: () => { bavail: number; bsize: number };
        baselineSize?: () => number;
    } = {
        availableParallelism: () => os.availableParallelism(),
        constrainedMemory: () =>
            typeof process.constrainedMemory === 'function'
                ? process.constrainedMemory()
                : undefined,
    },
    disk: DbtSourceFetchDiskConfig = {},
): DbtSourceFetchConcurrencyInputs => {
    const availableParallelism = Math.max(1, runtime.availableParallelism());
    const constrainedMemoryBytes = runtime.constrainedMemory();

    const memoryDerivedLimit =
        constrainedMemoryBytes !== undefined && constrainedMemoryBytes > 0
            ? Math.floor(
                  (constrainedMemoryBytes -
                      DBT_SOURCE_FETCH_MEMORY_RESERVE_BYTES) /
                      DBT_SOURCE_FETCH_MEMORY_PER_SOURCE_BYTES,
              )
            : null;

    let diskAvailableBytes = disk.sourceFetchDiskBudgetBytes ?? null;
    let diskBudgetSource: DbtSourceFetchConcurrencyInputs['diskBudgetSource'] =
        diskAvailableBytes === null ? 'unknown' : 'env';
    if (diskAvailableBytes === null) {
        try {
            const stats = runtime.statfs?.() ?? fs.statfsSync(os.tmpdir());
            diskAvailableBytes = stats.bavail * stats.bsize;
            diskBudgetSource = 'statfs';
        } catch {
            diskAvailableBytes = null;
        }
    }
    const diskDerivedLimit =
        diskAvailableBytes === null
            ? null
            : Math.max(
                  1,
                  Math.floor(
                      (diskAvailableBytes -
                          DBT_SOURCE_FETCH_DISK_RESERVE_BYTES -
                          (runtime.baselineSize?.() ??
                              getDbtPartialParseBaselineSize())) /
                          Math.max(
                              1,
                              disk.sourceFetchDiskPerSourceBytes ??
                                  DBT_SOURCE_FETCH_DISK_PER_SOURCE_BYTES,
                          ),
                  ),
              );
    const diskInputs = {
        diskAvailableBytes,
        diskBudgetSource,
        diskDerivedLimit,
        diskCapacity:
            diskDerivedLimit ?? DBT_SOURCE_FETCH_DEFAULT_DISK_CAPACITY,
    };

    if (override !== undefined) {
        return {
            ...diskInputs,
            override,
            availableParallelism,
            constrainedMemoryBytes,
            memoryDerivedLimit,
            chosen: Math.max(1, Math.floor(override)),
        };
    }

    const bounded = Math.min(
        availableParallelism,
        memoryDerivedLimit === null
            ? Number.POSITIVE_INFINITY
            : Math.max(
                  DBT_SOURCE_FETCH_MIN_MEMORY_CONCURRENCY,
                  memoryDerivedLimit,
              ),
    );
    const chosen = Math.min(
        DBT_SOURCE_FETCH_MAX_CONCURRENCY,
        diskDerivedLimit ?? Number.POSITIVE_INFINITY,
        Math.max(1, bounded),
    );

    return {
        ...diskInputs,
        override,
        availableParallelism,
        constrainedMemoryBytes,
        memoryDerivedLimit,
        chosen,
    };
};
