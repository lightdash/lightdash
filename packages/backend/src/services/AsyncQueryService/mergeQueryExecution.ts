import {
    getResultColumnMetadataFromItem,
    isMergeMetricSource,
    type ItemsMap,
    type MergeQuery,
    type MergeTypedColumn,
    type ParametersValuesMap,
    type ResultColumns,
} from '@lightdash/common';

/**
 * Builds the pre-pivot original columns of a compose-mode merge: display
 * metadata from the merged items map, and provenance from each typed
 * column's origin. A source-owned column's provenance identifies the field
 * in the leg query that produced it (fieldId + sourceQueryUuid — two sources
 * can both expose `orders_status`, so a fieldId alone is ambiguous). Join
 * keys are shared by every source, so they keep the merged field's own
 * provenance; table calculations have none.
 */
export const buildComposeMergeOriginalColumns = ({
    typedColumns,
    itemsMap,
    usedParametersValues,
    legQueryUuidBySourceId,
}: {
    typedColumns: MergeTypedColumn[];
    itemsMap: ItemsMap;
    usedParametersValues: ParametersValuesMap;
    legQueryUuidBySourceId: Record<string, string>;
}): ResultColumns =>
    Object.fromEntries(
        typedColumns.map((column) => {
            const metadata = getResultColumnMetadataFromItem(
                itemsMap[column.reference],
                column.reference,
                usedParametersValues,
            );
            if (column.origin.kind === 'source') {
                const sourceQueryUuid =
                    legQueryUuidBySourceId[column.origin.sourceId];
                if (sourceQueryUuid) {
                    metadata.provenance = {
                        fieldId: column.origin.sourceFieldId,
                        sourceQueryUuid,
                    };
                }
            }
            return [
                column.reference,
                {
                    reference: column.reference,
                    type: column.type,
                    ...metadata,
                },
            ];
        }),
    );

export const getMergeOutputColumnCount = (mergeQuery: MergeQuery): number =>
    mergeQuery.joinKey.length +
    mergeQuery.tableCalculations.length +
    mergeQuery.sources.reduce(
        (count, source) =>
            // A result source's column count lives in stored metadata; the
            // compiler's cell-cap clamp still applies to the merged limit.
            isMergeMetricSource(source)
                ? count +
                  source.metricQuery.metrics.length +
                  source.metricQuery.tableCalculations.length
                : count,
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
