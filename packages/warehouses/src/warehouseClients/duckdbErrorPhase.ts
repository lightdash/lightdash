/** Where a DuckDB statement failed; `@duckdb/node-api` does not expose the error type. */
export type DuckdbErrorPhase = 'parse' | 'bind' | 'runtime';

const phases = new WeakMap<object, DuckdbErrorPhase>();

/** Records the phase on the thrown error itself, leaving its class and message unchanged. */
export const withDuckdbErrorPhase = async <T>(
    phase: DuckdbErrorPhase,
    fn: () => Promise<T>,
): Promise<T> => {
    try {
        return await fn();
    } catch (error) {
        if (error !== null && typeof error === 'object' && !phases.has(error))
            phases.set(error, phase);
        throw error;
    }
};

export const getDuckdbErrorPhase = (error: unknown): DuckdbErrorPhase | null =>
    error !== null && typeof error === 'object'
        ? (phases.get(error) ?? null)
        : null;
