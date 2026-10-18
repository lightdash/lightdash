import {
    buildResultColumnItems,
    ChartKind,
    ChartType,
    convertSqlChartToPipelineChart,
    SQL_CHART_NODE_ID,
    type AllVizChartConfig,
    type ChartConfig,
    type ResultColumnItems,
    type ResultColumns,
    type VizColumn,
} from '@lightdash/common';

/** The chart a fresh SQL runner session draws: a bar chart over the first dimension and the metrics the result implies. */
export const DEFAULT_SQL_RUNNER_CHART_CONFIG: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: undefined,
};

/** The table the statement's result charts as; its field ids are `sql_<column>`, as a saved SQL chart's are. */
export const buildSqlRunnerItems = (
    columns: ResultColumns,
): ResultColumnItems =>
    buildResultColumnItems(columns, {
        table: SQL_CHART_NODE_ID,
        tableLabel: 'SQL',
    });

/** The result's columns as the SQL runner's other consumers (virtual views, dbt write-back) name them. */
export const toVizColumns = (columns: ResultColumns): VizColumn[] =>
    Object.values(columns).map((column) => ({
        reference: column.reference,
        type: column.type,
    }));

const LEGACY_CHART_KINDS = new Set<string>(Object.values(ChartKind));

/** Whether a stored config is the SQL runner's own chart config, as share links and charts saved before the fold carried it. */
export const isLegacyVizChartConfig = (
    value: unknown,
): value is AllVizChartConfig =>
    typeof value === 'object' &&
    value !== null &&
    'metadata' in value &&
    'type' in value &&
    typeof value.type === 'string' &&
    LEGACY_CHART_KINDS.has(value.type);

/** The explorer config and pivot a legacy SQL runner chart config draws as. */
export const convertLegacyVizChartConfig = ({
    sql,
    limit,
    config,
}: {
    sql: string;
    limit: number;
    config: AllVizChartConfig;
}): { chartConfig: ChartConfig; pivotDimensions: string[] | undefined } => {
    const converted = convertSqlChartToPipelineChart({ sql, limit, config });
    return {
        chartConfig: converted.chartConfig,
        pivotDimensions: converted.pivotConfig?.columns,
    };
};
