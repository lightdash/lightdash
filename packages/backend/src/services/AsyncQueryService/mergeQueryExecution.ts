import {
    getMergeSourceTableLabel,
    getResultColumnMetadataFromItem,
    getResultColumnSourceItem,
    isField,
    isMergeMetricSource,
    type ItemsMap,
    type MergeQuery,
    type MergeTypedColumn,
    type ParametersValuesMap,
    type ResultColumns,
} from '@lightdash/common';
import type { DuckdbQueryReferenceGuard } from './types';

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
                getResultColumnSourceItem(itemsMap, column.reference),
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

/**
 * What each source is called where the user can see it: the explore label the
 * compile already gave that source's columns, or the slot label when a source
 * contributes no value column. Source ids are internal and never shown.
 */
export const getMergeSourceLabels = ({
    sources,
    typedColumns,
    itemsMap,
}: {
    sources: Array<{ id: string }>;
    typedColumns: MergeTypedColumn[];
    itemsMap: ItemsMap;
}): Record<string, string> =>
    Object.fromEntries(
        sources.map((source, index) => {
            const column = typedColumns.find(
                ({ origin }) =>
                    origin.kind === 'source' && origin.sourceId === source.id,
            );
            const item = column ? itemsMap[column.reference] : undefined;
            return [
                source.id,
                item && isField(item)
                    ? item.tableLabel
                    : getMergeSourceTableLabel(index),
            ];
        }),
    );

/**
 * A leg that came back at the row cap may have had more rows behind it, and
 * the join cannot tell because the leg ran with its limit already at that
 * cap. Refuse on the leg's own row count instead, naming the source to
 * narrow. Known only once the leg has run, so it lands as the merged
 * query's error rather than a pre-execution refusal. An unknown row count
 * is not evidence, so it never refuses.
 */
export const getMergeRowCapError = ({
    legs,
    sourceRowCap,
}: {
    legs: Array<{ label: string; rowCount: number | null }>;
    sourceRowCap: number;
}): string | null => {
    const capped = legs
        .filter(({ rowCount }) => rowCount !== null && rowCount >= sourceRowCap)
        .map(({ label }) => label);
    if (capped.length === 0) return null;
    const consequence = `returned the maximum of ${sourceRowCap} rows, so the merged results would be missing data.`;
    return capped.length === 1
        ? `${capped[0]} ${consequence} Add a filter to ${capped[0]}, then merge again.`
        : `${capped.join(' and ')} each ${consequence} Add a filter to each, then merge again.`;
};

// A result that filled its own limit may hold more rows behind it; a missing limit or count is not evidence.
export const getMergeResultSourceCutShortError = ({
    limit,
    totalRowCount,
}: {
    limit: number | null;
    totalRowCount: number | null;
}): string | null => {
    if (limit === null || totalRowCount === null || totalRowCount < limit) {
        return null;
    }
    return `its results were cut short at their own limit of ${limit} rows, so the merged results would be missing data. Re-run that query with a higher limit or without one, then merge again.`;
};

/**
 * The guard a merge hands the execution tail: once the legs complete, refuse
 * before the join when one of them reached the row cap.
 */
export const buildMergeRowCapGuard =
    ({
        legLabelByReferenceTable,
        sourceRowCap,
    }: {
        legLabelByReferenceTable: Record<string, string>;
        sourceRowCap: number;
    }): DuckdbQueryReferenceGuard =>
    (completed) =>
        getMergeRowCapError({
            legs: Object.entries(legLabelByReferenceTable).map(
                ([tableName, label]) => ({
                    label,
                    rowCount: completed[tableName]?.totalRowCount ?? null,
                }),
            ),
            sourceRowCap,
        });
