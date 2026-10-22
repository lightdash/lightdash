import { derivePivotConfigurationFromChart } from '../../pivot/derivePivotConfigFromChart';
import {
    DimensionType,
    FieldType,
    friendlyName,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
} from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';
import { type PivotConfiguration } from '../../types/pivot';
import { type ResultColumn } from '../../types/results';
import {
    ChartType,
    type ChartConfig,
    type DataAppVizChart,
    type DataAppVizFieldMapping,
} from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import { getDataAppVizFieldIds } from '../apps/dataAppVizFieldMapping';
import { getRunQueryChartConfig } from './chartConfig/web/runQueryTool/getRunQueryChartConfig';
import {
    type ToolRunQueryBuiltinChartConfig,
    type ToolRunQueryCustomChartTypeConfig,
} from './schemas';

/** runQuery's builtin chartConfig; every field id is a result column reference. */
export type ComposerBuiltinVizConfig = ToolRunQueryBuiltinChartConfig;

/** runQuery's custom chart type config over column references, with the resolved type. */
export type ComposerCustomChartTypeVizConfig =
    ToolRunQueryCustomChartTypeConfig & {
        dataAppVizUuid: string;
        dataAppVizVersion: number | null;
    };

export type ComposerRunQueryVizConfig =
    | ComposerBuiltinVizConfig
    | ComposerCustomChartTypeVizConfig;

export const isComposerCustomChartTypeVizConfig = (
    config: ComposerRunQueryVizConfig,
): config is ComposerCustomChartTypeVizConfig =>
    'customChartTypeSlug' in config;

/** Synthetic explore name of a composer node result. */
export const COMPOSER_RESULT_TABLE_NAME = 'composer_result';

export type ComposerRunQueryChart = {
    metricQuery: MetricQuery;
    fields: ItemsMap;
    chartConfig: ChartConfig;
    /** Columns to pivot into series; empty when the chart has no series split. */
    pivotColumns: string[];
    /** Set when pivotColumns is not empty: the pivot to run over the node result. */
    pivotConfiguration: PivotConfiguration | null;
};

// getItemId(field) is `${table}_${name}`; split the reference so it round-trips.
const toTableAndName = (reference: string) => {
    const index = reference.indexOf('_');
    return index > 0
        ? { table: reference.slice(0, index), name: reference.slice(index + 1) }
        : { table: '', name: reference };
};

// Day-or-coarser truncations are calendar dates (GLITCH-452), though result
// columns report the warehouse's timestamp type.
const CALENDAR_TIME_FRAMES: (TimeFrames | undefined)[] = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

const toDimension = (column: ResultColumn): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type:
        column.type === DimensionType.TIMESTAMP &&
        CALENDAR_TIME_FRAMES.includes(column.timeInterval)
            ? DimensionType.DATE
            : column.type,
    ...toTableAndName(column.reference),
    label: column.label ?? friendlyName(column.reference),
    tableLabel: '',
    sql: '',
    hidden: false,
    ...(column.format ? { format: column.format } : {}),
    ...(column.timeInterval ? { timeInterval: column.timeInterval } : {}),
});

const toMetric = (column: ResultColumn): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.NUMBER,
    ...toTableAndName(column.reference),
    label: column.label ?? friendlyName(column.reference),
    tableLabel: '',
    sql: '',
    hidden: false,
    ...(column.format ? { format: column.format } : {}),
});

const unique = (references: string[]) => [...new Set(references)];

const toMetricQuery = (
    dimensions: string[],
    metrics: string[],
): MetricQuery => ({
    exploreName: COMPOSER_RESULT_TABLE_NAME,
    dimensions,
    metrics,
    filters: {},
    sorts: [],
    limit: 5000,
    tableCalculations: [],
});

const toFields = (
    columnsByReference: Map<string, ResultColumn>,
    dimensions: string[],
    metrics: string[],
): ItemsMap => {
    const get = (reference: string) => {
        const column = columnsByReference.get(reference);
        if (!column) {
            throw new Error(`Column "${reference}" is not in the result`);
        }
        return column;
    };
    return {
        ...Object.fromEntries(
            dimensions.map((reference) => [
                reference,
                toDimension(get(reference)),
            ]),
        ),
        ...Object.fromEntries(
            metrics.map((reference) => [reference, toMetric(get(reference))]),
        ),
    };
};

const getBuiltinChart = (
    columns: ResultColumn[],
    vizConfig: ComposerBuiltinVizConfig,
    metadata: { title: string; description: string },
): ComposerRunQueryChart => {
    const columnsByReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const isNumeric = (reference: string) =>
        columnsByReference.get(reference)?.type === DimensionType.NUMBER;
    const references = columns.map(({ reference }) => reference);

    let dimensions: string[];
    let metrics: string[];
    if (vizConfig.defaultVizType === 'table') {
        dimensions = references.filter((reference) => !isNumeric(reference));
        metrics = references.filter(isNumeric);
    } else {
        const x =
            vizConfig.xAxisDimension ??
            references.find((reference) => !isNumeric(reference));
        dimensions = unique([...(x ? [x] : []), ...(vizConfig.groupBy ?? [])]);
        metrics = unique([
            ...(vizConfig.yAxisMetrics ??
                references.filter(
                    (reference) =>
                        isNumeric(reference) && !dimensions.includes(reference),
                )),
            ...(vizConfig.secondaryYAxisMetric
                ? [vizConfig.secondaryYAxisMetric]
                : []),
        ]);
    }

    const metricQuery = toMetricQuery(dimensions, metrics);
    const fields = toFields(columnsByReference, dimensions, metrics);
    const chartConfig = getRunQueryChartConfig({
        queryTool: {
            ...metadata,
            queryConfig: { dimensions, metrics },
            chartConfig: vizConfig,
        },
        metricQuery,
        fieldsMap: fields,
    });
    const pivotColumns =
        chartConfig.type === ChartType.CARTESIAN
            ? (vizConfig.groupBy ?? [])
            : [];
    return {
        metricQuery,
        fields,
        chartConfig,
        pivotColumns,
        pivotConfiguration:
            pivotColumns.length > 0
                ? (derivePivotConfigurationFromChart(
                      { chartConfig, pivotConfig: { columns: pivotColumns } },
                      metricQuery,
                      fields,
                  ) ?? null)
                : null,
    };
};

/**
 * The custom chart type as a saved DATA_APP_VIZ chart. seriesSlots are the
 * type's `series` slot names (from its schema); the columns bound to them pivot.
 */
const getCustomChartTypeChart = (
    columns: ResultColumn[],
    vizConfig: ComposerCustomChartTypeVizConfig,
    seriesSlots: string[],
): ComposerRunQueryChart => {
    const columnsByReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const fieldMapping: DataAppVizFieldMapping = vizConfig.fieldMapping;
    const mapped = unique(
        Object.values(fieldMapping).flatMap(getDataAppVizFieldIds),
    );
    const pivotColumns = unique(
        seriesSlots.flatMap((slot) =>
            getDataAppVizFieldIds(fieldMapping[slot]),
        ),
    );
    const isMetric = (reference: string) =>
        columnsByReference.get(reference)?.type === DimensionType.NUMBER &&
        !pivotColumns.includes(reference);
    const dimensions = mapped.filter((reference) => !isMetric(reference));
    const metrics = mapped.filter(isMetric);
    const metricQuery = toMetricQuery(dimensions, metrics);
    const fields = toFields(columnsByReference, dimensions, metrics);
    const config: DataAppVizChart = {
        dataAppVizUuid: vizConfig.dataAppVizUuid,
        ...(vizConfig.dataAppVizVersion === null
            ? {}
            : { dataAppVizVersion: vizConfig.dataAppVizVersion }),
        fieldMapping,
        ...(vizConfig.options ? { optionValues: vizConfig.options } : {}),
    };
    const chartConfig: ChartConfig = { type: ChartType.DATA_APP_VIZ, config };
    return {
        metricQuery,
        fields,
        chartConfig,
        pivotColumns,
        pivotConfiguration:
            pivotColumns.length > 0
                ? (derivePivotConfigurationFromChart(
                      { chartConfig, pivotConfig: { columns: pivotColumns } },
                      metricQuery,
                      fields,
                  ) ?? null)
                : null,
    };
};

/**
 * Spike: renders a composer node result through the runQuery chart builders,
 * with field metadata synthesized from the result columns.
 */
export const getComposerRunQueryChart = ({
    columns,
    vizConfig,
    metadata,
    customChartTypeSeriesSlots,
}: {
    columns: ResultColumn[];
    vizConfig: ComposerRunQueryVizConfig;
    metadata: { title: string; description: string };
    customChartTypeSeriesSlots: string[];
}): ComposerRunQueryChart =>
    isComposerCustomChartTypeVizConfig(vizConfig)
        ? getCustomChartTypeChart(
              columns,
              vizConfig,
              customChartTypeSeriesSlots,
          )
        : getBuiltinChart(columns, vizConfig, metadata);
