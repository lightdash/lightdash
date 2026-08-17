import type { MergeQuery } from '@lightdash/common';

export const getMergeOutputColumnCount = (mergeQuery: MergeQuery): number =>
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
export const applyMergeExportLimit = ({
    mergeQuery,
    requestedRows,
    csvCellsLimit,
}: {
    mergeQuery: MergeQuery;
    requestedRows: number | null;
    csvCellsLimit: number;
}): MergeQuery => {
    // Structural validation remains the compiler's job so invalid exports
    // receive the same structured refusal as interactive runs.
    const columnCount = Math.max(getMergeOutputColumnCount(mergeQuery), 1);
    const cellLimitedRows = Math.floor(csvCellsLimit / columnCount);
    return {
        ...mergeQuery,
        limit:
            requestedRows === null
                ? cellLimitedRows
                : Math.min(requestedRows, cellLimitedRows),
    };
};
