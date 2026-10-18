import {
    buildSavedPipelineItems,
    buildSavedPipelineVizNode,
    derivePivotConfigurationFromChart,
    getPipelineTerminalNode,
    getResultColumnFieldId,
    getSavedPipelineFieldIds,
    isField,
    PIPELINE_VIZ_NODE_ID,
    type ItemsMap,
    type MetricQuery,
    type PivotConfiguration,
    type ResultColumns,
    type SavedChartDAO,
    type SavedPipelineDefinition,
    type SortField,
    type SourceQuery,
} from '@lightdash/common';
import { buildMergeResultMetricQuery } from '../../utils/QueryBuilder/MergeQueryComposer';

export type SavedPipelineRunPlan = {
    /** The stored nodes followed by the chart's own node. */
    queries: SourceQuery[];
    vizNodeId: string;
    /** Every terminal column as a field, keyed by `<terminalNodeId>_<column>`. */
    itemsMap: ItemsMap;
    /** Field ids in the chart's column order, the unknown ones dropped and the missing ones appended. */
    columnOrder: string[];
    /** Describes the result for ordering and the chart config; never compiled. */
    metricQuery: MetricQuery;
    sorts: SortField[];
    limit: number;
    pivotConfiguration: PivotConfiguration | undefined;
    /** The chart node's columns as the plan supplies them, keyed by field id. */
    originalColumns: ResultColumns;
    /** Column types for the chart node's virtual view. */
    typedColumns: { reference: string; type: ResultColumns[string]['type'] }[];
    referenceLabels: Record<string, string>;
};

/**
 * Everything a saved pipeline chart's run needs, from the chart and its
 * pipeline: the field identity of the result (the terminal columns under
 * their field ids), the chart's sort, limit and pivot resolved against it,
 * and the node the run appends to produce it. Pure, so the saved chart and
 * dashboard runs share it and tests can pin it.
 */
export const planSavedPipelineRun = ({
    savedChart,
    pipeline,
    pivotResults,
    pivotConfiguration: requestedPivotConfiguration,
    dashboardSorts,
    limit,
}: {
    savedChart: Pick<
        SavedChartDAO,
        'metricQuery' | 'chartConfig' | 'pivotConfig' | 'tableConfig'
    >;
    pipeline: SavedPipelineDefinition;
    pivotResults: boolean | undefined;
    /** A caller-derived pivot wins over the chart's own layout. */
    pivotConfiguration: PivotConfiguration | undefined;
    /** Validated dashboard sort overrides, when the tile has any. */
    dashboardSorts: SortField[] | undefined;
    /** The rows to return; the chart's own limit when the caller has none. */
    limit: number;
}): SavedPipelineRunPlan => {
    const items = buildSavedPipelineItems(pipeline);
    const fieldIds = getSavedPipelineFieldIds(pipeline);
    const known = new Set(fieldIds);
    const ordered = savedChart.tableConfig.columnOrder.filter((fieldId) =>
        known.has(fieldId),
    );
    const columnOrder = [
        ...ordered,
        ...fieldIds.filter((fieldId) => !ordered.includes(fieldId)),
    ];
    const sorts = (dashboardSorts ?? savedChart.metricQuery.sorts).filter(
        (sort) => known.has(sort.fieldId),
    );
    const metricQuery = buildMergeResultMetricQuery({
        itemsMap: items.itemsMap,
        columnOrder,
        sorts,
        limit,
        exploreName: pipeline.terminalNodeId,
    });
    const pivotConfiguration =
        requestedPivotConfiguration ??
        (pivotResults
            ? derivePivotConfigurationFromChart(
                  {
                      chartConfig: savedChart.chartConfig,
                      pivotConfig: savedChart.pivotConfig,
                  },
                  metricQuery,
                  items.itemsMap,
              )
            : undefined);
    const terminal = getPipelineTerminalNode(pipeline);
    const originalColumns: ResultColumns = Object.fromEntries(
        Object.values(pipeline.columns).map((column) => {
            const fieldId = getResultColumnFieldId(
                pipeline.terminalNodeId,
                column.reference,
            );
            const item = items.itemsMap[fieldId];
            const field = item && isField(item) ? item : undefined;
            return [
                fieldId,
                {
                    ...column,
                    reference: fieldId,
                    label: column.label ?? field?.label,
                    // Resolved to the terminal node's query when the node submits
                    provenance: {
                        fieldId,
                        sourceQueryUuid: pipeline.terminalNodeId,
                        fieldType: field?.fieldType,
                    },
                },
            ];
        }),
    );
    return {
        queries: [
            ...pipeline.queries,
            buildSavedPipelineVizNode({ pipeline, pivotConfiguration }),
        ],
        vizNodeId: PIPELINE_VIZ_NODE_ID,
        itemsMap: items.itemsMap,
        columnOrder,
        metricQuery,
        sorts,
        limit,
        pivotConfiguration,
        originalColumns,
        typedColumns: Object.values(pipeline.columns).map((column) => ({
            reference: getResultColumnFieldId(
                pipeline.terminalNodeId,
                column.reference,
            ),
            type: column.type,
        })),
        referenceLabels: {
            [pipeline.terminalNodeId]:
                terminal?.title ?? pipeline.terminalNodeId,
        },
    };
};
