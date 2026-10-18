import {
    buildSqlChartPipeline,
    SQL_CHART_NODE_ID,
    type ChartConfig,
    type CreateSavedChartVersion,
    type ParametersValuesMap,
    type ResultColumnItems,
    type ResultColumns,
} from '@lightdash/common';

type Args = {
    sql: string;
    limit: number;
    /** The statement's result columns, as the chart's fields. */
    columns: ResultColumns;
    items: ResultColumnItems;
    chartConfig: ChartConfig;
    pivotDimensions: string[] | undefined;
    warehouseConnectionUuid: string | null;
    parameters?: ParametersValuesMap;
};

/**
 * A SQL runner chart as a saved chart version: the statement as a one-node
 * pipeline, the result's columns as the fields and the explorer config as
 * drawn, so the saved chart reruns the statement and draws the same way
 * on dashboards and in deliveries.
 */
export const buildSqlRunnerSavedChartVersion = ({
    sql,
    limit,
    columns,
    items,
    chartConfig,
    pivotDimensions,
    warehouseConnectionUuid,
    parameters,
}: Args): CreateSavedChartVersion => ({
    tableName: SQL_CHART_NODE_ID,
    metricQuery: { ...items.metricQuery, limit },
    chartConfig,
    tableConfig: {
        columnOrder: [
            ...items.metricQuery.dimensions,
            ...items.metricQuery.metrics,
        ],
    },
    pivotConfig:
        pivotDimensions && pivotDimensions.length > 0
            ? { columns: pivotDimensions }
            : undefined,
    pipeline: buildSqlChartPipeline({
        sql,
        limit,
        columns,
        warehouseConnectionUuid,
    }),
    ...(parameters ? { parameters } : {}),
});
