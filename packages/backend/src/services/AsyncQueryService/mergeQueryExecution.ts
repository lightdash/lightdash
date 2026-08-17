import type { MergeQuery, MergeQueryExecutionMode } from '@lightdash/common';

export const getMergeResultColumnCount = (mergeQuery: MergeQuery): number =>
    mergeQuery.joinKey.length +
    mergeQuery.tableCalculations.length +
    mergeQuery.sources.reduce(
        (count, source) =>
            count +
            source.metricQuery.metrics.length +
            source.metricQuery.tableCalculations.length,
        0,
    );

/** Resolve the final merged row limit before compilation. Source CTE limits
 * stay untouched because merge compilation deliberately removes them. */
export const applyMergeExecutionMode = ({
    mergeQuery,
    mode,
    csvCellsLimit,
}: {
    mergeQuery: MergeQuery;
    mode: MergeQueryExecutionMode;
    csvCellsLimit: number;
}): MergeQuery => {
    if (mode.type === 'interactive') return mergeQuery;

    // Structural validation remains the compiler's job so invalid exports
    // receive the same structured refusal as interactive runs.
    const columnCount = Math.max(getMergeResultColumnCount(mergeQuery), 1);
    const cellLimitedRows = Math.floor(csvCellsLimit / columnCount);
    return {
        ...mergeQuery,
        limit:
            mode.limit === null
                ? cellLimitedRows
                : Math.min(mode.limit, cellLimitedRows),
    };
};
