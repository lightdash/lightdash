import { z } from 'zod';
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
import assertUnreachable from '../../utils/assertUnreachable';
import { getDataAppVizFieldIds } from '../apps/dataAppVizFieldMapping';
import { getRunQueryChartConfig } from './chartConfig/web/runQueryTool/getRunQueryChartConfig';
import { type ToolRunQueryBuiltinChartConfig } from './schemas';

const refSchema = z
    .string()
    .describe('Result column reference of the terminal node');

const refsSchema = z.array(refSchema);

export const composerChartVizTypeSchema = z.enum([
    'table',
    'big_number',
    'bar',
    'line',
    'area',
    'scatter',
    'pie',
    'funnel',
    'custom',
]);

export type ComposerChartVizType = z.infer<typeof composerChartVizTypeSchema>;

/** Flat viz config over result column references; one shape for every type. */
export const composerChartVizConfigSchema = z.object({
    type: composerChartVizTypeSchema.describe(
        'Chart type. area is a filled line; custom renders a custom chart type.',
    ),
    x: refSchema
        .nullable()
        .describe(
            'Category or time column. bar/line/area/scatter/pie/funnel. null for table/big_number, or to use the first non-numeric column.',
        ),
    y: refsSchema
        .nullable()
        .describe(
            'Value columns. big_number, pie and funnel use y[0]. null to use every numeric column not on x or groupBy.',
        ),
    groupBy: refsSchema
        .nullable()
        .describe(
            'Columns that split y into one series per value. bar/line/area/scatter only. Must not include x.',
        ),
    stack: z
        .boolean()
        .nullable()
        .describe(
            'bar/area: stack series on top of each other. area always stacks. Ignored elsewhere.',
        ),
    horizontal: z
        .boolean()
        .nullable()
        .describe('bar only: draw bars horizontally.'),
    xAxisType: z
        .enum(['category', 'time'])
        .nullable()
        .describe(
            'Override the x axis type. null infers it from the x column (date/timestamp -> time).',
        ),
    y2: refsSchema
        .nullable()
        .describe(
            'Columns on a secondary (right) y axis. bar/line/area (drawn as a line on area). Must not overlap y. Only the first is drawn for now.',
        ),
    labels: z
        .object({
            x: z.string().nullable(),
            y: z.string().nullable(),
            y2: z.string().nullable(),
        })
        .nullable()
        .describe('Axis titles. big_number uses labels.y as its label.'),
    customChartTypeSlug: z
        .string()
        .nullable()
        .describe('custom only: slug of the custom chart type.'),
    fieldMapping: z
        .record(z.string(), z.union([refSchema, refsSchema]))
        .nullable()
        .describe(
            'custom only: binds each slot of the custom chart type to a column (or ordered columns for a multiple slot).',
        ),
    options: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .nullable()
        .describe(
            "custom only: values for the type's options; null for defaults.",
        ),
});

export type ComposerChartVizConfig = z.infer<
    typeof composerChartVizConfigSchema
>;

/** Stored form: the server resolves the custom chart type; null unless type is custom. */
export type ComposerStoredChartVizConfig = ComposerChartVizConfig & {
    dataAppVizUuid: string | null;
    dataAppVizVersion: number | null;
};

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

const isTimeType = (type: DimensionType) =>
    type === DimensionType.DATE || type === DimensionType.TIMESTAMP;

const toDimensionType = (
    column: ResultColumn,
    xAxisType: ComposerChartVizConfig['xAxisType'],
): DimensionType => {
    // The renderer picks the axis type from the field type.
    if (xAxisType === 'category' && isTimeType(column.type)) {
        return DimensionType.STRING;
    }
    return column.type === DimensionType.TIMESTAMP &&
        CALENDAR_TIME_FRAMES.includes(column.timeInterval)
        ? DimensionType.DATE
        : column.type;
};

const toDimension = (
    column: ResultColumn,
    xAxisType: ComposerChartVizConfig['xAxisType'],
): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: toDimensionType(column, xAxisType),
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

const getColumn = (
    columnsByReference: Map<string, ResultColumn>,
    reference: string,
) => {
    const column = columnsByReference.get(reference);
    if (!column) {
        throw new Error(`Column "${reference}" is not in the result`);
    }
    return column;
};

const toFields = (
    columnsByReference: Map<string, ResultColumn>,
    dimensions: string[],
    metrics: string[],
    xAxisType: ComposerChartVizConfig['xAxisType'] = null,
): ItemsMap => ({
    ...Object.fromEntries(
        dimensions.map((reference) => [
            reference,
            toDimension(getColumn(columnsByReference, reference), xAxisType),
        ]),
    ),
    ...Object.fromEntries(
        metrics.map((reference) => [
            reference,
            toMetric(getColumn(columnsByReference, reference)),
        ]),
    ),
});

const getPivotConfiguration = (
    chartConfig: ChartConfig,
    metricQuery: MetricQuery,
    fields: ItemsMap,
    pivotColumns: string[],
): PivotConfiguration | null =>
    pivotColumns.length > 0
        ? (derivePivotConfigurationFromChart(
              { chartConfig, pivotConfig: { columns: pivotColumns } },
              metricQuery,
              fields,
          ) ?? null)
        : null;

type CartesianVizType = 'bar' | 'line' | 'area' | 'scatter';
type BuiltinVizType = Exclude<ComposerChartVizType, 'custom'>;

const isCartesianVizType = (type: BuiltinVizType): type is CartesianVizType =>
    type === 'bar' || type === 'line' || type === 'area' || type === 'scatter';

const toRunQueryVizType = (
    vizConfig: ComposerChartVizConfig & {
        type: CartesianVizType | 'pie' | 'funnel';
    },
): ToolRunQueryBuiltinChartConfig['defaultVizType'] => {
    switch (vizConfig.type) {
        case 'bar':
            return vizConfig.horizontal ? 'horizontal' : 'bar';
        case 'line':
        case 'area':
            return 'line';
        case 'scatter':
        case 'pie':
        case 'funnel':
            return vizConfig.type;
        default:
            return assertUnreachable(vizConfig.type, 'Unknown viz type');
    }
};

const getTableChart = (columns: ResultColumn[]): ComposerRunQueryChart => {
    const columnsByReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const references = columns.map(({ reference }) => reference);
    const isNumeric = (reference: string) =>
        columnsByReference.get(reference)?.type === DimensionType.NUMBER;
    const dimensions = references.filter((reference) => !isNumeric(reference));
    const metrics = references.filter(isNumeric);
    const metricQuery = toMetricQuery(dimensions, metrics);
    return {
        metricQuery,
        fields: toFields(columnsByReference, dimensions, metrics),
        chartConfig: { type: ChartType.TABLE },
        pivotColumns: [],
        pivotConfiguration: null,
    };
};

const getBigNumberChart = (
    columns: ResultColumn[],
    vizConfig: ComposerChartVizConfig,
): ComposerRunQueryChart => {
    const columnsByReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const value =
        vizConfig.y?.[0] ??
        columns.find((column) => column.type === DimensionType.NUMBER)
            ?.reference;
    if (!value) throw new Error('big_number needs a numeric column');
    const metricQuery = toMetricQuery([], [value]);
    const label = vizConfig.labels?.y ?? null;
    return {
        metricQuery,
        fields: toFields(columnsByReference, [], [value]),
        chartConfig: {
            type: ChartType.BIG_NUMBER,
            config: {
                selectedField: value,
                showBigNumberLabel: true,
                showTableNamesInLabel: false,
                ...(label ? { label } : {}),
            },
        },
        pivotColumns: [],
        pivotConfiguration: null,
    };
};

// The renderer stacks every area series into one stack across axes, so the
// secondary axis is drawn as a plain line and layout stacking is turned off.
const withUnstackedSecondaryArea = (chartConfig: ChartConfig): ChartConfig => {
    if (chartConfig.type !== ChartType.CARTESIAN || !chartConfig.config) {
        return chartConfig;
    }
    const { layout, eChartsConfig } = chartConfig.config;
    return {
        ...chartConfig,
        config: {
            ...chartConfig.config,
            layout: { ...layout, stack: false },
            eChartsConfig: {
                ...eChartsConfig,
                series: eChartsConfig.series?.map((series) =>
                    series.yAxisIndex === 1
                        ? { ...series, areaStyle: undefined, stack: undefined }
                        : series,
                ),
            },
        },
    };
};

const getRunQueryBuilderChart = (
    columns: ResultColumn[],
    vizConfig: ComposerChartVizConfig & {
        type: CartesianVizType | 'pie' | 'funnel';
    },
    metadata: { title: string; description: string },
): ComposerRunQueryChart => {
    const columnsByReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const isNumeric = (reference: string) =>
        columnsByReference.get(reference)?.type === DimensionType.NUMBER;
    const references = columns.map(({ reference }) => reference);
    const isCartesian = isCartesianVizType(vizConfig.type);

    const groupBy = isCartesian ? (vizConfig.groupBy ?? []) : [];
    const x =
        vizConfig.x ?? references.find((reference) => !isNumeric(reference));
    const dimensions = unique([...(x ? [x] : []), ...groupBy]);
    const y =
        vizConfig.y ??
        references.filter(
            (reference) =>
                isNumeric(reference) && !dimensions.includes(reference),
        );
    const y2 =
        isCartesian && vizConfig.type !== 'scatter' ? (vizConfig.y2 ?? []) : [];
    const overlap = y2.filter((reference) => y.includes(reference));
    if (overlap.length > 0) {
        throw new Error(`y2 must not overlap y: ${overlap.join(', ')}`);
    }
    // The builders take one secondary axis column; extra y2 columns are dropped.
    const secondary = y2[0] ?? null;
    const metrics = unique([...y, ...(secondary ? [secondary] : [])]);

    const metricQuery = toMetricQuery(dimensions, metrics);
    const fields = toFields(
        columnsByReference,
        dimensions,
        metrics,
        vizConfig.xAxisType,
    );
    const builtChartConfig = getRunQueryChartConfig({
        queryTool: {
            ...metadata,
            queryConfig: { dimensions, metrics },
            chartConfig: {
                defaultVizType: toRunQueryVizType(vizConfig),
                xAxisDimension: x ?? null,
                yAxisMetrics: y,
                groupBy: groupBy.length > 0 ? groupBy : null,
                xAxisType: vizConfig.xAxisType,
                stackBars: vizConfig.type === 'bar' ? vizConfig.stack : null,
                lineType: vizConfig.type === 'area' ? 'area' : null,
                xAxisLabel: vizConfig.labels?.x ?? '',
                yAxisLabel: vizConfig.labels?.y ?? '',
                secondaryYAxisMetric: secondary,
                secondaryYAxisLabel: vizConfig.labels?.y2 ?? null,
            },
        },
        metricQuery,
        fieldsMap: fields,
    });
    const chartConfig =
        vizConfig.type === 'area' && secondary
            ? withUnstackedSecondaryArea(builtChartConfig)
            : builtChartConfig;
    const pivotColumns =
        chartConfig.type === ChartType.CARTESIAN ? groupBy : [];
    return {
        metricQuery,
        fields,
        chartConfig,
        pivotColumns,
        pivotConfiguration: getPivotConfiguration(
            chartConfig,
            metricQuery,
            fields,
            pivotColumns,
        ),
    };
};

/**
 * The custom chart type as a saved DATA_APP_VIZ chart. seriesSlots are the
 * type's `series` slot names (from its schema); the columns bound to them pivot.
 */
const getCustomChartTypeChart = (
    columns: ResultColumn[],
    vizConfig: ComposerStoredChartVizConfig,
    seriesSlots: string[],
): ComposerRunQueryChart => {
    const { dataAppVizUuid } = vizConfig;
    if (!dataAppVizUuid || !vizConfig.fieldMapping) {
        throw new Error('custom needs a resolved chart type and fieldMapping');
    }
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
        dataAppVizUuid,
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
        pivotConfiguration: getPivotConfiguration(
            chartConfig,
            metricQuery,
            fields,
            pivotColumns,
        ),
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
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
    customChartTypeSeriesSlots: string[];
}): ComposerRunQueryChart => {
    const { type } = vizConfig;
    switch (type) {
        case 'table':
            return getTableChart(columns);
        case 'big_number':
            return getBigNumberChart(columns, vizConfig);
        case 'custom':
            return getCustomChartTypeChart(
                columns,
                vizConfig,
                customChartTypeSeriesSlots,
            );
        case 'bar':
        case 'line':
        case 'area':
        case 'scatter':
        case 'pie':
        case 'funnel':
            return getRunQueryBuilderChart(
                columns,
                { ...vizConfig, type },
                metadata,
            );
        default:
            return assertUnreachable(type, 'Unknown composer viz type');
    }
};
