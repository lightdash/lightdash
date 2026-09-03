import os from 'os';

export const DBT_SOURCE_FETCH_MEMORY_RESERVE_BYTES = 3 * 1024 * 1024 * 1024;
export const DBT_SOURCE_FETCH_MEMORY_PER_SOURCE_BYTES = 1024 * 1024 * 1024;
export const DBT_SOURCE_FETCH_MAX_CONCURRENCY = 8;

export type DbtSourceFetchConcurrencyInputs = {
    override: number | undefined;
    availableParallelism: number;
    constrainedMemoryBytes: number | undefined;
    memoryDerivedLimit: number | null;
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
 */
export const resolveDbtSourceFetchConcurrency = (
    override: number | undefined,
    // injectable for tests only
    runtime: {
        availableParallelism: () => number;
        constrainedMemory: () => number | undefined;
    } = {
        availableParallelism: () => os.availableParallelism(),
        constrainedMemory: () =>
            typeof process.constrainedMemory === 'function'
                ? process.constrainedMemory()
                : undefined,
    },
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

    if (override !== undefined) {
        return {
            override,
            availableParallelism,
            constrainedMemoryBytes,
            memoryDerivedLimit,
            chosen: Math.max(1, Math.floor(override)),
        };
    }

    const bounded = Math.min(
        availableParallelism,
        memoryDerivedLimit ?? Number.POSITIVE_INFINITY,
    );
    const chosen = Math.min(
        DBT_SOURCE_FETCH_MAX_CONCURRENCY,
        Math.max(1, bounded),
    );

    return {
        override,
        availableParallelism,
        constrainedMemoryBytes,
        memoryDerivedLimit,
        chosen,
    };
};
