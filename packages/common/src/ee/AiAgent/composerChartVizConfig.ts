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
import { getItemId } from '../../utils/item';
import { getDataAppVizFieldIds } from '../apps/dataAppVizFieldMapping';
import { getRunQueryChartConfig } from './chartConfig/web/runQueryTool/getRunQueryChartConfig';
import {
    customChartTypeOptionValueSchema,
    type ToolRunQueryBuiltinChartConfig,
} from './schemas';

const refSchema = z
    .string()
    .describe('A result column reference of the presented node');

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

const composerChartVizConfigSchemaV1 = z.object({
    type: composerChartVizTypeSchema.describe(
        'Chart type. area is a filled line; custom renders a custom chart type.',
    ),
    x: refSchema
        .nullable()
        .describe(
            'Category or time column. bar/line/area/scatter/pie/funnel. null for table/big_number, or to use the first non-numeric column.',
        ),
    y: z
        .array(refSchema)
        .nullable()
        .describe(
            'Value columns. big_number, pie and funnel use y[0]. null to use every numeric column not on x or groupBy.',
        ),
    groupBy: z
        .array(refSchema)
        .nullable()
        .describe(
            'Columns that split y into one series per value. bar/line/area/scatter only. Must not include x.',
        ),
    stack: z
        .boolean()
        .nullable()
        .describe(
            'bar: stack series on top of each other. area always stacks. Ignored elsewhere.',
        ),
    horizontal: z
        .boolean()
        .nullable()
        .describe('bar only: draw bars horizontally.'),
    y2: refSchema
        .nullable()
        .describe(
            'Column on a secondary (right) y axis. bar/line/area (drawn as a line on area). Must not be in y.',
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
        .record(z.string(), z.union([refSchema, z.array(refSchema)]))
        .nullable()
        .describe(
            'custom only: binds each slot of the custom chart type to a column, or ordered columns for a multiple slot.',
        ),
    options: z
        .record(z.string(), customChartTypeOptionValueSchema)
        .nullable()
        .describe(
            "custom only: values for the type's options; null for defaults.",
        ),
});

/** The viz config the agent writes: the agent chart vocabulary over result column references. */
export const composerChartVizConfigSchema = composerChartVizConfigSchemaV1;

export type ComposerChartVizConfig = z.infer<
    typeof composerChartVizConfigSchema
>;

const composerStoredChartVizConfigSchemaV1 =
    composerChartVizConfigSchemaV1.extend({
        dataAppVizUuid: z.string().nullable(),
        dataAppVizVersion: z.number().nullable(),
    });

// Wide contract for parsing stored viz configs; call sites use this alias.
// Additive fields are `.nullish().default(null)` on the current version; a
// restructure adds V(N), bumps the composer artifact schemaVersion with it,
// and keeps this alias parsing everything ever stored.
export const composerChartVizConfigSchemaPersisted =
    composerStoredChartVizConfigSchemaV1;

/** Stored form: the custom chart type pinned by the server; both null unless type is custom. */
export type ComposerStoredChartVizConfig = z.infer<
    typeof composerChartVizConfigSchemaPersisted
>;

export const parseComposerStoredChartVizConfig = (
    raw: unknown,
): ComposerStoredChartVizConfig | null => {
    const parsed = composerChartVizConfigSchemaPersisted.safeParse(raw);
    return parsed.success ? parsed.data : null;
};

/** Synthetic explore of a composer node result; its fields are the result columns. */
export const COMPOSER_RESULT_TABLE_NAME = 'composer_result';

export const getComposerResultFieldId = (reference: string): string =>
    getItemId({ table: COMPOSER_RESULT_TABLE_NAME, name: reference });

export type ComposerRunQueryChart = {
    metricQuery: MetricQuery;
    fields: ItemsMap;
    chartConfig: ChartConfig;
    /** Field ids pivoted into series; empty without a series split. */
    pivotColumns: string[];
    /** Set when pivotColumns is not empty: the pivot over the chart stage. */
    pivotConfiguration: PivotConfiguration | null;
};

// Day-or-coarser truncations are calendar dates, though result columns
// report the warehouse's timestamp type.
const CALENDAR_TIME_FRAMES: (TimeFrames | undefined)[] = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

const isTimeType = (type: DimensionType) =>
    type === DimensionType.DATE || type === DimensionType.TIMESTAMP;

const toDimensionType = (column: ResultColumn): DimensionType =>
    column.type === DimensionType.TIMESTAMP &&
    CALENDAR_TIME_FRAMES.includes(column.timeInterval)
        ? DimensionType.DATE
        : column.type;

const toFieldBase = (column: ResultColumn) => ({
    table: COMPOSER_RESULT_TABLE_NAME,
    name: column.reference,
    label: column.label ?? friendlyName(column.reference),
    tableLabel: '',
    sql: '',
    hidden: false,
    ...(column.format ? { format: column.format } : {}),
});

const toDimension = (column: ResultColumn): Dimension => ({
    ...toFieldBase(column),
    fieldType: FieldType.DIMENSION,
    type: toDimensionType(column),
    ...(column.timeInterval ? { timeInterval: column.timeInterval } : {}),
});

const toMetric = (column: ResultColumn): Metric => ({
    ...toFieldBase(column),
    fieldType: FieldType.METRIC,
    type: MetricType.NUMBER,
});

const unique = (values: string[]) => [...new Set(values)];

/** Result columns by reference; rejects references that would share a field id. */
class ComposerColumns {
    private readonly byReference: Map<string, ResultColumn>;

    constructor(readonly columns: ResultColumn[]) {
        this.byReference = new Map(
            columns.map((column) => [column.reference, column]),
        );
        const fieldIds = new Map<string, string>();
        columns.forEach(({ reference }) => {
            const fieldId = getComposerResultFieldId(reference);
            const other = fieldIds.get(fieldId);
            if (other !== undefined && other !== reference) {
                throw new Error(
                    `Columns "${other}" and "${reference}" cannot be charted together`,
                );
            }
            fieldIds.set(fieldId, reference);
        });
    }

    get(reference: string): ResultColumn {
        const column = this.byReference.get(reference);
        if (!column) {
            throw new Error(`Column "${reference}" is not in the result`);
        }
        return column;
    }

    isNumeric(reference: string): boolean {
        return this.byReference.get(reference)?.type === DimensionType.NUMBER;
    }

    get references(): string[] {
        return this.columns.map(({ reference }) => reference);
    }
}

/** Builds the synthetic query and fields over references; everything downstream reads field ids. */
const toQuery = (
    columns: ComposerColumns,
    dimensions: string[],
    metrics: string[],
): { metricQuery: MetricQuery; fields: ItemsMap } => {
    const fields: ItemsMap = {};
    dimensions.forEach((reference) => {
        fields[getComposerResultFieldId(reference)] = toDimension(
            columns.get(reference),
        );
    });
    metrics.forEach((reference) => {
        fields[getComposerResultFieldId(reference)] = toMetric(
            columns.get(reference),
        );
    });
    return {
        metricQuery: {
            exploreName: COMPOSER_RESULT_TABLE_NAME,
            dimensions: dimensions.map(getComposerResultFieldId),
            metrics: metrics.map(getComposerResultFieldId),
            filters: {},
            sorts: [],
            limit: 5000,
            tableCalculations: [],
        },
        fields,
    };
};

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
type RunQueryBuilderVizType = CartesianVizType | 'pie' | 'funnel';

const isCartesianVizType = (
    type: RunQueryBuilderVizType,
): type is CartesianVizType =>
    type === 'bar' || type === 'line' || type === 'area' || type === 'scatter';

const toRunQueryVizType = (
    type: RunQueryBuilderVizType,
    horizontal: boolean | null,
): ToolRunQueryBuiltinChartConfig['defaultVizType'] => {
    switch (type) {
        case 'bar':
            return horizontal ? 'horizontal' : 'bar';
        case 'line':
        case 'area':
            return 'line';
        case 'scatter':
        case 'pie':
        case 'funnel':
            return type;
        default:
            return assertUnreachable(type, 'Unknown viz type');
    }
};

const getTableChart = (columns: ComposerColumns): ComposerRunQueryChart => {
    const { references } = columns;
    const metrics = references.filter((ref) => columns.isNumeric(ref));
    const dimensions = references.filter((ref) => !columns.isNumeric(ref));
    return {
        ...toQuery(columns, dimensions, metrics),
        chartConfig: { type: ChartType.TABLE },
        pivotColumns: [],
        pivotConfiguration: null,
    };
};

const getBigNumberChart = (
    columns: ComposerColumns,
    vizConfig: ComposerChartVizConfig,
): ComposerRunQueryChart => {
    const value =
        vizConfig.y?.[0] ??
        columns.references.find((ref) => columns.isNumeric(ref));
    if (!value) throw new Error('big_number needs a numeric column');
    const label = vizConfig.labels?.y ?? null;
    return {
        ...toQuery(columns, [], [value]),
        chartConfig: {
            type: ChartType.BIG_NUMBER,
            config: {
                selectedField: getComposerResultFieldId(value),
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
    columns: ComposerColumns,
    vizConfig: ComposerChartVizConfig,
    type: RunQueryBuilderVizType,
    metadata: { title: string; description: string },
): ComposerRunQueryChart => {
    const isCartesian = isCartesianVizType(type);
    const groupBy = isCartesian ? (vizConfig.groupBy ?? []) : [];
    const x =
        vizConfig.x ??
        columns.references.find((ref) => !columns.isNumeric(ref)) ??
        null;
    const dimensions = unique([...(x ? [x] : []), ...groupBy]);
    const y =
        vizConfig.y ??
        columns.references.filter(
            (ref) => columns.isNumeric(ref) && !dimensions.includes(ref),
        );
    const y2 =
        isCartesian && type !== 'scatter' ? (vizConfig.y2 ?? null) : null;
    if (y2 !== null && y.includes(y2)) {
        throw new Error(`y2 must not be in y: ${y2}`);
    }
    const metrics = unique([...y, ...(y2 ? [y2] : [])]);
    const { metricQuery, fields } = toQuery(columns, dimensions, metrics);
    const fieldIdOf = getComposerResultFieldId;

    const builtChartConfig = getRunQueryChartConfig({
        queryTool: {
            ...metadata,
            queryConfig: {
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
            },
            chartConfig: {
                defaultVizType: toRunQueryVizType(type, vizConfig.horizontal),
                xAxisDimension: x ? fieldIdOf(x) : null,
                yAxisMetrics: y.map(fieldIdOf),
                groupBy: groupBy.length > 0 ? groupBy.map(fieldIdOf) : null,
                xAxisType:
                    x && isTimeType(columns.get(x).type) ? 'time' : 'category',
                stackBars: type === 'bar' ? vizConfig.stack : null,
                lineType: type === 'area' ? 'area' : null,
                xAxisLabel: vizConfig.labels?.x ?? '',
                yAxisLabel: vizConfig.labels?.y ?? '',
                secondaryYAxisMetric: y2 ? fieldIdOf(y2) : null,
                secondaryYAxisLabel: vizConfig.labels?.y2 ?? null,
            },
        },
        metricQuery,
        fieldsMap: fields,
    });
    const chartConfig =
        type === 'area' && y2
            ? withUnstackedSecondaryArea(builtChartConfig)
            : builtChartConfig;
    const pivotColumns =
        chartConfig.type === ChartType.CARTESIAN ? groupBy.map(fieldIdOf) : [];
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

const mapFieldMapping = (
    fieldMapping: DataAppVizFieldMapping,
    map: (reference: string) => string,
): DataAppVizFieldMapping =>
    Object.fromEntries(
        Object.entries(fieldMapping).map(([slot, value]) => [
            slot,
            typeof value === 'string' ? map(value) : value.map(map),
        ]),
    );

/** The custom chart type as a DATA_APP_VIZ chart; columns bound to its series slots pivot. */
const getCustomChartTypeChart = (
    columns: ComposerColumns,
    vizConfig: ComposerStoredChartVizConfig,
    seriesSlots: string[],
): ComposerRunQueryChart => {
    const { dataAppVizUuid, fieldMapping } = vizConfig;
    if (!dataAppVizUuid || !fieldMapping) {
        throw new Error('custom needs a resolved chart type and fieldMapping');
    }
    const mapped = unique(
        Object.values(fieldMapping).flatMap(getDataAppVizFieldIds),
    );
    const split = unique(
        seriesSlots.flatMap((slot) =>
            getDataAppVizFieldIds(fieldMapping[slot]),
        ),
    );
    const isMetric = (ref: string) =>
        columns.isNumeric(ref) && !split.includes(ref);
    const { metricQuery, fields } = toQuery(
        columns,
        mapped.filter((ref) => !isMetric(ref)),
        mapped.filter(isMetric),
    );
    const config: DataAppVizChart = {
        dataAppVizUuid,
        ...(vizConfig.dataAppVizVersion === null
            ? {}
            : { dataAppVizVersion: vizConfig.dataAppVizVersion }),
        fieldMapping: mapFieldMapping(fieldMapping, getComposerResultFieldId),
        ...(vizConfig.options ? { optionValues: vizConfig.options } : {}),
    };
    const chartConfig: ChartConfig = { type: ChartType.DATA_APP_VIZ, config };
    const pivotColumns = split.map(getComposerResultFieldId);
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
 * A node result drawn by the runQuery chart builders: a synthetic metric query
 * and fields from the result columns. seriesSlots are the custom chart type's
 * `series` slot names.
 */
export const getComposerRunQueryChart = ({
    columns: resultColumns,
    vizConfig,
    metadata,
    customChartTypeSeriesSlots,
}: {
    columns: ResultColumn[];
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
    customChartTypeSeriesSlots: string[];
}): ComposerRunQueryChart => {
    const columns = new ComposerColumns(resultColumns);
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
            return getRunQueryBuilderChart(columns, vizConfig, type, metadata);
        default:
            return assertUnreachable(type, 'Unknown composer viz type');
    }
};

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The chart stage: a compose-engine query renaming the node result's columns to field ids, then pivoting when the chart splits series. */
export const getComposerChartStage = ({
    columns,
    chart,
    sourceName,
}: {
    columns: ResultColumn[];
    chart: ComposerRunQueryChart;
    sourceName: string;
}): { sql: string; pivotConfiguration: PivotConfiguration | null } => {
    // Builders treat any extra row key as data (funnel labels), so select only the chart's fields.
    const fieldIds = new Set([
        ...chart.metricQuery.dimensions,
        ...chart.metricQuery.metrics,
    ]);
    return {
        sql: `SELECT ${columns
            .filter(({ reference }) =>
                fieldIds.has(getComposerResultFieldId(reference)),
            )
            .map(
                ({ reference }) =>
                    `${quoteIdentifier(reference)} AS ${quoteIdentifier(getComposerResultFieldId(reference))}`,
            )
            .join(', ')} FROM ${quoteIdentifier(sourceName)}`,
        pivotConfiguration: chart.pivotConfiguration,
    };
};
