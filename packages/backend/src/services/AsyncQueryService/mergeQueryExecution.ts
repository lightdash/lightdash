import {
    getMergeSourceTableLabel,
    getResultColumnMetadataFromItem,
    getUnaccountedDimensions,
    isField,
    isMergeMetricSource,
    NotSupportedError,
    QuerySourceType,
    type FieldId,
    type ItemsMap,
    type MergeColumnTotal,
    type MergeQuery,
    type MergeTypedColumn,
    type MetricQuery,
    type ParametersValuesMap,
    type ResultColumns,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import { TotalQueryBuilder } from '../../utils/QueryBuilder/TotalQueryBuilder';
import type { DuckdbQueryReferenceGuard } from './types';

/**
 * A merge leg as a DAG node: the source's metric query run whole, at the
 * source row cap with no sorts, since the merged statement sorts and limits
 * and a side must never be silently truncated below the cap.
 */
export const buildMergeLegNode = ({
    nodeId,
    metricQuery,
    sourceRowCap,
}: {
    nodeId: string;
    metricQuery: MetricQuery;
    sourceRowCap: number;
}): SemanticLayerSourceQuery => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId,
    exploreName: metricQuery.exploreName,
    dimensions: metricQuery.dimensions,
    metrics: metricQuery.metrics,
    filters: metricQuery.filters,
    sorts: [],
    limit: sourceRowCap,
    tableCalculations: metricQuery.tableCalculations,
    additionalMetrics: metricQuery.additionalMetrics,
    customDimensions: metricQuery.customDimensions,
    metricOverrides: metricQuery.metricOverrides,
    dimensionOverrides: metricQuery.dimensionOverrides,
    timezone: metricQuery.timezone,
});

/**
 * Builds the pre-pivot original columns of a compose-mode merge: display
 * metadata from the merged items map, and provenance from each typed
 * column's origin. A source-owned column's provenance identifies the field
 * in the leg query that produced it (fieldId + sourceQueryUuid — two sources
 * can both expose `orders_status`, so a fieldId alone is ambiguous). Join
 * keys are shared by every source, so they keep the merged field's own
 * provenance; table calculations have none.
 *
 * A leg reference is its queryUuid, or the id of the DAG node that will
 * produce it: a node id resolves to the queryUuid when the join submits.
 */
export const buildComposeMergeOriginalColumns = ({
    typedColumns,
    itemsMap,
    usedParametersValues,
    legReferenceBySourceId,
}: {
    typedColumns: MergeTypedColumn[];
    itemsMap: ItemsMap;
    usedParametersValues: ParametersValuesMap;
    legReferenceBySourceId: Record<string, string>;
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
                    legReferenceBySourceId[column.origin.sourceId];
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
                  getUnaccountedDimensions(source, mergeQuery.joinKey).length +
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

/** A source's grand total run as a DAG node beside the merged totals. */
export type MergeSourceTotalLeg = {
    sourceId: string;
    nodeId: string;
    label: string;
    node: SemanticLayerSourceQuery;
    /** The merged columns the leg totals, with the source metric each reads. */
    columns: Array<{ fieldId: FieldId; sourceFieldId: FieldId }>;
};

// Null when the collapse leaves nothing to select, such as a query whose
// only metrics are period-over-period.
const collapseToGrandTotal = (metricQuery: MetricQuery): MetricQuery | null => {
    try {
        return new TotalQueryBuilder({
            metricQuery,
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;
    } catch (e) {
        if (e instanceof NotSupportedError) return null;
        throw e;
    }
};

/**
 * One grand-total leg per source whose own query totals the rows shown (see
 * getMergeColumnTotals): the source's metric query collapsed to one row,
 * carrying only the metrics the merged columns need. A period-over-period
 * metric needs its time dimension, so the collapse drops it and its column
 * stays without a total.
 */
export const planMergeSourceTotalLegs = ({
    mergeQuery,
    columnTotals,
}: {
    mergeQuery: MergeQuery;
    columnTotals: Record<FieldId, MergeColumnTotal>;
}): MergeSourceTotalLeg[] =>
    mergeQuery.sources.flatMap((source, index): MergeSourceTotalLeg[] => {
        if (!isMergeMetricSource(source)) return [];
        const wanted = Object.entries(columnTotals).flatMap(
            ([fieldId, total]) =>
                total.from === 'sourceQuery' && total.sourceId === source.id
                    ? [{ fieldId, sourceFieldId: total.sourceFieldId, total }]
                    : [],
        );
        if (wanted.length === 0) return [];
        const grandTotal = collapseToGrandTotal(source.metricQuery);
        if (grandTotal === null) return [];
        const columns = wanted.filter(({ sourceFieldId }) =>
            grandTotal.metrics.includes(sourceFieldId),
        );
        if (columns.length === 0) return [];
        const nodeId = `source_total_${index}`;
        return [
            {
                sourceId: source.id,
                nodeId,
                label: `${wanted[0].total.sourceLabel} total`,
                node: buildMergeLegNode({
                    nodeId,
                    metricQuery: {
                        ...grandTotal,
                        metrics: columns.map(
                            ({ sourceFieldId }) => sourceFieldId,
                        ),
                        tableCalculations: [],
                    },
                    sourceRowCap: 1,
                }),
                columns: columns.map(({ fieldId, sourceFieldId }) => ({
                    fieldId,
                    sourceFieldId,
                })),
            },
        ];
    });
