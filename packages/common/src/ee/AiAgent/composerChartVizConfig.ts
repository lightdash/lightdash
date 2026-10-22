import { z } from 'zod';
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
import {
    QuerySourceType,
    type DuckdbSourceQuery,
    type QueryNodeId,
} from '../../types/querySources';
import { type ResultColumn, type ResultRow } from '../../types/results';
import {
    ChartType,
    type ChartConfig,
    type DataAppVizChart,
    type DataAppVizFieldMapping,
} from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import assertUnreachable from '../../utils/assertUnreachable';
import { getItemId } from '../../utils/item';
import {
    VizAggregationOptions,
    VizIndexType,
} from '../../visualizations/types';
import { getDataAppVizFieldIds } from '../apps/dataAppVizFieldMapping';
import { type DataAppVizField } from '../apps/types';
import { getRunQueryChartConfig } from './chartConfig/web/runQueryTool/getRunQueryChartConfig';
import {
    customChartTypeOptionValueSchema,
    type ToolRunQueryBuiltinChartConfig,
} from './schemas';

const refSchema = z
    .string()
    .describe('A result column reference of the presented node');

const composerBuiltinChartVizTypeSchema = z.enum([
    'table',
    'big_number',
    'bar',
    'line',
    'area',
    'scatter',
    'pie',
    'funnel',
]);

const composerBuiltinChartVizConfigSchemaV1 = z.object({
    type: composerBuiltinChartVizTypeSchema.describe(
        'Chart type. area is a filled line.',
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
});

const composerCustomChartVizConfigSchemaV1 = z.object({
    type: z.literal('custom').describe('Renders a custom chart type.'),
    customChartTypeSlug: z.string().describe('Slug of the custom chart type.'),
    fieldMapping: z
        .record(z.string(), z.union([refSchema, z.array(refSchema)]))
        .describe(
            'Binds each slot of the custom chart type to a column, or ordered columns for a multiple slot.',
        ),
    options: z
        .record(z.string(), customChartTypeOptionValueSchema)
        .nullable()
        .describe("Values for the type's options; null for defaults."),
});

const composerChartVizConfigSchemaV1 = z.discriminatedUnion('type', [
    composerBuiltinChartVizConfigSchemaV1,
    composerCustomChartVizConfigSchemaV1,
]);

/** The viz config the agent writes: the agent chart vocabulary over result column references. */
export const composerChartVizConfigSchema = composerChartVizConfigSchemaV1;

export type ComposerChartVizConfig = z.infer<
    typeof composerChartVizConfigSchema
>;

export type ComposerBuiltinChartVizConfig = z.infer<
    typeof composerBuiltinChartVizConfigSchemaV1
>;

export type ComposerCustomChartVizConfig = z.infer<
    typeof composerCustomChartVizConfigSchemaV1
>;

const composerStoredCustomChartVizConfigSchemaV1 =
    composerCustomChartVizConfigSchemaV1.extend({
        dataAppVizUuid: z.string(),
        dataAppVizVersion: z.number().nullable(),
    });

const composerStoredChartVizConfigSchemaV1 = z.discriminatedUnion('type', [
    composerBuiltinChartVizConfigSchemaV1,
    composerStoredCustomChartVizConfigSchemaV1,
]);

// Wide contract for parsing stored viz configs; call sites use this alias.
// Additive fields are `.nullish().default(null)` on the current version; a
// restructure adds V(N), bumps the composer artifact schemaVersion with it,
// and keeps this alias parsing everything ever stored.
export const composerChartVizConfigSchemaPersisted =
    composerStoredChartVizConfigSchemaV1;

/** Stored form: a custom chart type carries the version the server pinned. */
export type ComposerStoredChartVizConfig = z.infer<
    typeof composerChartVizConfigSchemaPersisted
>;

export type ComposerStoredCustomChartVizConfig = z.infer<
    typeof composerStoredCustomChartVizConfigSchemaV1
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
};

/** Slots of a custom chart type; their kinds decide what a custom chart splits and measures. */
export type ComposerCustomChartTypeSlot = Pick<
    DataAppVizField,
    'name' | 'type'
>;

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
    };
};

const getBigNumberChart = (
    columns: ComposerColumns,
    vizConfig: ComposerBuiltinChartVizConfig,
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
    vizConfig: ComposerBuiltinChartVizConfig,
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
    return {
        metricQuery,
        fields,
        chartConfig,
        pivotColumns: groupBy.map(fieldIdOf),
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

/** References bound to a custom chart type's slots: series slots split, metric slots measure, the rest index. */
const getCustomChartTypeReferences = (
    fieldMapping: DataAppVizFieldMapping,
    slots: ComposerCustomChartTypeSlot[],
) => {
    const boundTo = (type: ComposerCustomChartTypeSlot['type']) =>
        unique(
            slots
                .filter((slot) => slot.type === type)
                .flatMap((slot) =>
                    getDataAppVizFieldIds(fieldMapping[slot.name]),
                ),
        );
    const split = boundTo('series');
    const values = boundTo('metric').filter((ref) => !split.includes(ref));
    const index = unique(
        Object.values(fieldMapping).flatMap(getDataAppVizFieldIds),
    ).filter((ref) => !split.includes(ref) && !values.includes(ref));
    return { index, split, values };
};

/** The custom chart type as a DATA_APP_VIZ chart; columns bound to its series slots pivot. */
const getCustomChartTypeChart = (
    columns: ComposerColumns,
    vizConfig: ComposerStoredCustomChartVizConfig,
    slots: ComposerCustomChartTypeSlot[],
): ComposerRunQueryChart => {
    const { dataAppVizUuid, fieldMapping } = vizConfig;
    const { index, split, values } = getCustomChartTypeReferences(
        fieldMapping,
        slots,
    );
    const { metricQuery, fields } = toQuery(
        columns,
        [...index, ...split],
        values,
    );
    const config: DataAppVizChart = {
        dataAppVizUuid,
        ...(vizConfig.dataAppVizVersion === null
            ? {}
            : { dataAppVizVersion: vizConfig.dataAppVizVersion }),
        fieldMapping: mapFieldMapping(fieldMapping, getComposerResultFieldId),
        ...(vizConfig.options ? { optionValues: vizConfig.options } : {}),
    };
    return {
        metricQuery,
        fields,
        chartConfig: { type: ChartType.DATA_APP_VIZ, config },
        pivotColumns: split.map(getComposerResultFieldId),
    };
};

/**
 * A node result drawn by the runQuery chart builders: a synthetic metric query
 * and fields from the result columns of the run being drawn.
 */
export const getComposerRunQueryChart = ({
    columns: resultColumns,
    vizConfig,
    metadata,
    customChartTypeSlots,
}: {
    columns: ResultColumn[];
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
    customChartTypeSlots: ComposerCustomChartTypeSlot[];
}): ComposerRunQueryChart => {
    const columns = new ComposerColumns(resultColumns);
    if (vizConfig.type === 'custom') {
        return getCustomChartTypeChart(
            columns,
            vizConfig,
            customChartTypeSlots,
        );
    }
    const { type } = vizConfig;
    switch (type) {
        case 'table':
            return getTableChart(columns);
        case 'big_number':
            return getBigNumberChart(columns, vizConfig);
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

/** Row keys renamed to field ids, keeping only the chart's fields: builders treat any extra key as data (funnel labels). */
export const toComposerResultRows = (
    chart: ComposerRunQueryChart,
    rows: ResultRow[],
): ResultRow[] => {
    const fieldIds = [
        ...chart.metricQuery.dimensions,
        ...chart.metricQuery.metrics,
    ];
    return rows.map((row) =>
        Object.fromEntries(
            fieldIds.map((fieldId) => [
                fieldId,
                row[chart.fields[fieldId].name],
            ]),
        ),
    );
};

/** References of a series split, from the viz config alone; null without one. */
const getSplitReferences = (
    vizConfig: ComposerStoredChartVizConfig,
    customChartTypeSlots: ComposerCustomChartTypeSlot[],
): { index: string[]; split: string[]; values: string[] } | null => {
    if (vizConfig.type === 'custom') {
        const references = getCustomChartTypeReferences(
            vizConfig.fieldMapping,
            customChartTypeSlots,
        );
        if (references.split.length === 0) return null;
        if (references.values.length === 0) {
            throw new Error('A series split needs a column on a metric slot');
        }
        return references;
    }
    const { type } = vizConfig;
    switch (type) {
        case 'table':
        case 'big_number':
        case 'pie':
        case 'funnel':
            return null;
        case 'bar':
        case 'line':
        case 'area':
        case 'scatter': {
            const split = unique(vizConfig.groupBy ?? []);
            if (split.length === 0) return null;
            const { x, y } = vizConfig;
            if (x === null || y === null || y.length === 0) {
                throw new Error(
                    'A series split needs explicit x and y columns',
                );
            }
            const y2 = type === 'scatter' ? null : vizConfig.y2;
            return {
                index: [x],
                split,
                values: unique([...y, ...(y2 ? [y2] : [])]),
            };
        }
        default:
            return assertUnreachable(type, 'Unknown composer viz type');
    }
};

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

const CHART_STAGE_SOURCE_NAME = 'node_result';

/**
 * The chart stage for a series split: a DuckDB query over the presented
 * node's result renaming the split's columns to field ids, then pivoting.
 * Derived from the viz config's references alone; null without a split.
 * source is the presented node's id or result query uuid.
 */
export const getComposerChartStage = ({
    vizConfig,
    customChartTypeSlots,
    nodeId,
    source,
}: {
    vizConfig: ComposerStoredChartVizConfig;
    customChartTypeSlots: ComposerCustomChartTypeSlot[];
    nodeId: QueryNodeId;
    source: string;
}): DuckdbSourceQuery | null => {
    const references = getSplitReferences(vizConfig, customChartTypeSlots);
    if (!references) return null;
    const { index, split, values } = references;
    const fieldId = getComposerResultFieldId;
    return {
        sourceType: QuerySourceType.DUCKDB,
        nodeId,
        sql: `SELECT ${unique([...index, ...split, ...values])
            .map(
                (reference) =>
                    `${quoteIdentifier(reference)} AS ${quoteIdentifier(fieldId(reference))}`,
            )
            .join(', ')} FROM ${quoteIdentifier(CHART_STAGE_SOURCE_NAME)}`,
        references: { [CHART_STAGE_SOURCE_NAME]: source },
        pivotConfiguration: {
            // The pivot reads only the references; the axis type comes from the chart.
            indexColumn: index.map((reference) => ({
                reference: fieldId(reference),
                type: VizIndexType.CATEGORY,
            })),
            groupByColumns: split.map((reference) => ({
                reference: fieldId(reference),
            })),
            valuesColumns: values.map((reference) => ({
                reference: fieldId(reference),
                aggregation: VizAggregationOptions.ANY,
            })),
            sortBy: undefined,
        },
    };
};
