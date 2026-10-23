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
import { type ResultColumn } from '../../types/results';
import {
    ChartType,
    type ChartConfig,
    type DataAppVizChart,
    type DataAppVizFieldMapping,
} from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import assertUnreachable from '../../utils/assertUnreachable';
import { formatItemValue } from '../../utils/formatting';
import { getItemId } from '../../utils/item';
import {
    VizAggregationOptions,
    VizIndexType,
} from '../../visualizations/types';
import { getDataAppVizFieldIds } from '../apps/dataAppVizFieldMapping';
import { type DataAppVizField } from '../apps/types';
import { getRunQueryChartConfig } from './chartConfig/web/runQueryTool/getRunQueryChartConfig';
import {
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
    type ComposerStoredCustomChartVizConfig,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
} from './schemas';

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

/** Builtin types Slack posts as a chart image; tables, big numbers and custom types are not images. */
export const isComposerSlackImageVizConfig = (
    vizConfig: ComposerStoredChartVizConfig,
): vizConfig is ComposerBuiltinChartVizConfig & {
    type: RunQueryBuilderVizType;
} =>
    vizConfig.type === 'bar' ||
    vizConfig.type === 'line' ||
    vizConfig.type === 'area' ||
    vizConfig.type === 'scatter' ||
    vizConfig.type === 'pie' ||
    vizConfig.type === 'funnel';

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

const getBigNumberReferences = (
    columns: ComposerColumns,
    vizConfig: ComposerBuiltinChartVizConfig,
): { value: string; label: string | null } => {
    const value =
        vizConfig.y?.[0] ??
        columns.references.find((ref) => columns.isNumeric(ref));
    if (!value) throw new Error('big_number needs a numeric column');
    return { value, label: vizConfig.labels?.y || null };
};

const getBigNumberChart = (
    columns: ComposerColumns,
    vizConfig: ComposerBuiltinChartVizConfig,
): ComposerRunQueryChart => {
    const { value, label } = getBigNumberReferences(columns, vizConfig);
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

/** The runQuery tool query and chart config a builtin composer chart maps onto. */
const getRunQueryBuilderInput = (
    columns: ComposerColumns,
    vizConfig: ComposerBuiltinChartVizConfig,
    type: RunQueryBuilderVizType,
) => {
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
    const chartConfig: ToolRunQueryBuiltinChartConfig = {
        defaultVizType: toRunQueryVizType(type, vizConfig.horizontal),
        xAxisDimension: x ? fieldIdOf(x) : null,
        yAxisMetrics: y.map(fieldIdOf),
        groupBy: groupBy.length > 0 ? groupBy.map(fieldIdOf) : null,
        xAxisType: x && isTimeType(columns.get(x).type) ? 'time' : 'category',
        stackBars: type === 'bar' ? vizConfig.stack : null,
        lineType: type === 'area' ? 'area' : null,
        xAxisLabel: vizConfig.labels?.x ?? '',
        yAxisLabel: vizConfig.labels?.y ?? '',
        secondaryYAxisMetric: y2 ? fieldIdOf(y2) : null,
        secondaryYAxisLabel: vizConfig.labels?.y2 ?? null,
    };
    return { metricQuery, fields, chartConfig };
};

const getRunQueryBuilderChart = (
    columns: ComposerColumns,
    vizConfig: ComposerBuiltinChartVizConfig,
    type: RunQueryBuilderVizType,
    metadata: { title: string; description: string },
): ComposerRunQueryChart => {
    const { metricQuery, fields, chartConfig } = getRunQueryBuilderInput(
        columns,
        vizConfig,
        type,
    );
    const builtChartConfig = getRunQueryChartConfig({
        queryTool: {
            ...metadata,
            queryConfig: {
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
            },
            chartConfig,
        },
        metricQuery,
        fieldsMap: fields,
    });
    return {
        metricQuery,
        fields,
        chartConfig:
            type === 'area' && chartConfig.secondaryYAxisMetric
                ? withUnstackedSecondaryArea(builtChartConfig)
                : builtChartConfig,
        pivotColumns: chartConfig.groupBy ?? [],
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
export const toComposerResultRows = <Value>(
    chart: Pick<ComposerRunQueryChart, 'metricQuery' | 'fields'>,
    rows: Record<string, Value>[],
): Record<string, Value>[] => {
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

export type ComposerBigNumber = { value: string; label: string };

/** A big number's first-row value, formatted as the web card draws it; null when that value is empty. */
export const getComposerBigNumber = ({
    columns,
    rows,
    vizConfig,
}: {
    columns: ResultColumn[];
    rows: Record<string, unknown>[];
    vizConfig: ComposerStoredChartVizConfig;
}): ComposerBigNumber | null => {
    if (vizConfig.type !== 'big_number') return null;
    const composerColumns = new ComposerColumns(columns);
    const { value: reference, label } = getBigNumberReferences(
        composerColumns,
        vizConfig,
    );
    const value = rows[0]?.[reference];
    if (value === null || value === undefined) return null;
    const metric = toMetric(composerColumns.get(reference));
    return {
        value: formatItemValue(metric, value),
        label: label ?? metric.label,
    };
};

/**
 * A builtin composer chart as runQuery tool args over the chart's fields only,
 * for the Slack image builders; null for types Slack posts as a link or table.
 */
export const getComposerSlackRunQueryChart = ({
    columns: resultColumns,
    rows,
    vizConfig,
    metadata,
}: {
    columns: ResultColumn[];
    rows: Record<string, unknown>[];
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
}): {
    tool: ToolRunQueryArgsTransformed;
    rows: Record<string, unknown>[];
    fields: ItemsMap;
} | null => {
    if (!isComposerSlackImageVizConfig(vizConfig)) return null;
    const { metricQuery, fields, chartConfig } = getRunQueryBuilderInput(
        new ComposerColumns(resultColumns),
        vizConfig,
        vizConfig.type,
    );
    return {
        tool: {
            ...metadata,
            queryConfig: {
                exploreName: COMPOSER_RESULT_TABLE_NAME,
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
                sorts: [],
                limit: null,
                parameters: null,
                customMetrics: null,
                tableCalculations: null,
                filters: {},
            },
            chartConfig,
            mergeConfig: null,
        },
        rows: toComposerResultRows({ metricQuery, fields }, rows),
        fields,
    };
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
