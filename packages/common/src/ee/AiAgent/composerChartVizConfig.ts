import {
    COMPOSER_RESULT_EXPLORE_NAME,
    ComposerResultColumns,
    getComposerResultFieldId,
    getComposerResultQuery,
    getComposerSplitStage,
    toComposerResultMetric,
    toComposerResultRows,
    type ComposerSplitChart,
} from '../../composer/composerResultChart';
import { DimensionType, type ItemsMap } from '../../types/field';
import { type MetricQuery, type SortField } from '../../types/metricQuery';
import {
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
import assertUnreachable from '../../utils/assertUnreachable';
import { formatItemValue } from '../../utils/formatting';
import { getDataAppVizFieldIds } from '../apps/dataAppVizFieldMapping';
import { type DataAppVizField } from '../apps/types';
import { getRunQueryChartConfig } from './chartConfig/web/runQueryTool/getRunQueryChartConfig';
import { type ComposerNodeColumn } from './composerArtifact';
import {
    type ComposerBuiltinChartVizConfig,
    type ComposerChartVizConfig,
    type ComposerCustomChartVizConfig,
    type ComposerStoredChartVizConfig,
    type ComposerStoredCustomChartVizConfig,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
} from './schemas';

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

const isTimeType = (type: DimensionType) =>
    type === DimensionType.DATE || type === DimensionType.TIMESTAMP;

const unique = (values: string[]) => [...new Set(values)];

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

const getTableChart = (
    columns: ComposerResultColumns,
): ComposerRunQueryChart => {
    const { references } = columns;
    const metrics = references.filter((ref) => columns.isNumeric(ref));
    const dimensions = references.filter((ref) => !columns.isNumeric(ref));
    return {
        ...getComposerResultQuery(columns, dimensions, metrics),
        chartConfig: { type: ChartType.TABLE },
        pivotColumns: [],
    };
};

const getBigNumberReferences = (
    columns: ComposerResultColumns,
    vizConfig: ComposerBuiltinChartVizConfig,
): { value: string; label: string | null } => {
    const value =
        vizConfig.y?.[0] ??
        columns.references.find((ref) => columns.isNumeric(ref));
    if (!value) throw new Error('big_number needs a numeric column');
    return { value, label: vizConfig.labels?.y || null };
};

const getBigNumberChart = (
    columns: ComposerResultColumns,
    vizConfig: ComposerBuiltinChartVizConfig,
): ComposerRunQueryChart => {
    const { value, label } = getBigNumberReferences(columns, vizConfig);
    return {
        ...getComposerResultQuery(columns, [], [value]),
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
    columns: ComposerResultColumns,
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
    const { metricQuery, fields } = getComposerResultQuery(
        columns,
        dimensions,
        metrics,
    );
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
    columns: ComposerResultColumns,
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
    columns: ComposerResultColumns,
    vizConfig: ComposerStoredCustomChartVizConfig,
    slots: ComposerCustomChartTypeSlot[],
): ComposerRunQueryChart => {
    const { dataAppVizUuid, fieldMapping } = vizConfig;
    const { index, split, values } = getCustomChartTypeReferences(
        fieldMapping,
        slots,
    );
    const { metricQuery, fields } = getComposerResultQuery(
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
    const columns = new ComposerResultColumns(resultColumns);
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
    const composerColumns = new ComposerResultColumns(columns);
    const { value: reference, label } = getBigNumberReferences(
        composerColumns,
        vizConfig,
    );
    const value = rows[0]?.[reference];
    if (value === null || value === undefined) return null;
    const metric = toComposerResultMetric(composerColumns.get(reference));
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
        new ComposerResultColumns(resultColumns),
        vizConfig,
        vizConfig.type,
    );
    return {
        tool: {
            ...metadata,
            queryConfig: {
                exploreName: COMPOSER_RESULT_EXPLORE_NAME,
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

/** The split as a classic chart over field ids, with its columns by role; null without a split. */
const getSplitChart = (
    vizConfig: ComposerStoredChartVizConfig,
    customChartTypeSlots: ComposerCustomChartTypeSlot[],
): ComposerSplitChart | null => {
    if (vizConfig.type === 'custom') {
        const { index, split, values } = getCustomChartTypeReferences(
            vizConfig.fieldMapping,
            customChartTypeSlots,
        );
        if (split.length === 0) return null;
        if (values.length === 0) {
            throw new Error('A series split needs a column on a metric slot');
        }
        return {
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: vizConfig.dataAppVizUuid,
                    fieldMapping: mapFieldMapping(
                        vizConfig.fieldMapping,
                        getComposerResultFieldId,
                    ),
                },
            },
            pivotColumns: split,
            dimensions: [...index, ...split],
            metrics: values,
        };
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
            const values = unique([...y, ...(y2 ? [y2] : [])]);
            return {
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: getComposerResultFieldId(x),
                            yField: values.map(getComposerResultFieldId),
                            // Area always stacks, as the drawn chart does.
                            stack:
                                type === 'area' ||
                                (type === 'bar' && !!vizConfig.stack),
                        },
                        eChartsConfig: { series: [] },
                    },
                },
                pivotColumns: split,
                dimensions: unique([x, ...split]),
                metrics: values,
            };
        }
        default:
            return assertUnreachable(type, 'Unknown composer viz type');
    }
};

/** The pivot stage for the viz config's series split over source (the presented node's id or result query uuid); null without a split. */
export const getComposerChartStage = ({
    vizConfig,
    customChartTypeSlots,
    sorts,
    nodeId,
    source,
}: {
    vizConfig: ComposerStoredChartVizConfig;
    customChartTypeSlots: ComposerCustomChartTypeSlot[];
    /** The source node's sorts, by field id. */
    sorts: SortField[];
    nodeId: QueryNodeId;
    source: string;
}): DuckdbSourceQuery | null => {
    const splitChart = getSplitChart(vizConfig, customChartTypeSlots);
    return (
        splitChart &&
        getComposerSplitStage({ ...splitChart, sorts, nodeId, source })
    );
};

type ReferenceCheck = {
    has: (reference: string) => boolean;
    isNumeric: (reference: string) => boolean;
    typeOf: (reference: string) => DimensionType | null;
    numericReferences: string[];
    hasNonNumeric: boolean;
};

const toReferenceCheck = (columns: ComposerNodeColumn[]): ReferenceCheck => {
    const types = new Map(
        columns.map(({ reference, type }) => [reference, type]),
    );
    return {
        has: (reference) => types.has(reference),
        isNumeric: (reference) => types.get(reference) === DimensionType.NUMBER,
        typeOf: (reference) => types.get(reference) ?? null,
        numericReferences: columns
            .filter(({ type }) => type === DimensionType.NUMBER)
            .map(({ reference }) => reference),
        hasNonNumeric: columns.some(
            ({ type }) => type !== DimensionType.NUMBER,
        ),
    };
};

const getMissingReferenceErrors = (
    check: ReferenceCheck,
    bindings: [label: string, references: string[]][],
): string[] =>
    bindings.flatMap(([label, references]) =>
        references
            .filter((reference) => !check.has(reference))
            .map(
                (reference) =>
                    `${label}: column "${reference}" is not in the result`,
            ),
    );

const getNonNumericErrors = (
    check: ReferenceCheck,
    label: string,
    references: string[],
): string[] =>
    references
        .filter(
            (reference) => check.has(reference) && !check.isNumeric(reference),
        )
        .map(
            (reference) =>
                `${label}: column "${reference}" is ${check.typeOf(reference) ?? 'untyped'}, not numeric`,
        );

export const COMPOSER_VIZ_MISSING_X_ERROR =
    'x: no category or time column to draw; set x';

const getBuiltinReferenceErrors = (
    check: ReferenceCheck,
    vizConfig: ComposerBuiltinChartVizConfig,
): string[] => {
    const { type, x } = vizConfig;
    const y = vizConfig.y ?? [];
    const groupBy = vizConfig.groupBy ?? [];
    const y2 = vizConfig.y2 === null ? [] : [vizConfig.y2];
    const isCartesian =
        type === 'bar' ||
        type === 'line' ||
        type === 'area' ||
        type === 'scatter';
    const usesY2 = type === 'bar' || type === 'line' || type === 'area';
    // big_number, pie and funnel draw y[0] only.
    const drawnY = isCartesian ? y : y.slice(0, 1);
    const hasDefaultY = check.numericReferences.some(
        (reference) => reference !== x && !groupBy.includes(reference),
    );
    return [
        ...getMissingReferenceErrors(check, [
            ['x', x === null ? [] : [x]],
            ['y', y],
            ['groupBy', groupBy],
            ['y2', y2],
        ]),
        ...(type === 'table' ? [] : getNonNumericErrors(check, 'y', drawnY)),
        ...(type !== 'table' && vizConfig.y === null && !hasDefaultY
            ? ['y: no numeric column to draw; set y to a numeric column']
            : []),
        ...(isCartesian && x === null && !check.hasNonNumeric
            ? [COMPOSER_VIZ_MISSING_X_ERROR]
            : []),
        ...(usesY2 ? getNonNumericErrors(check, 'y2', y2) : []),
        ...(usesY2 && y2.some((reference) => y.includes(reference))
            ? [`y2: column "${y2[0]}" must not also be in y`]
            : []),
        ...(isCartesian
            ? groupBy
                  .filter(
                      (reference) => reference === x || y.includes(reference),
                  )
                  .map(
                      (reference) =>
                          `groupBy: column "${reference}" must not also be on x or y`,
                  )
            : []),
        ...(isCartesian && groupBy.length > 0 && (x === null || y.length === 0)
            ? ['groupBy: a series split needs explicit x and y columns']
            : []),
    ];
};

export type ComposerCustomChartTypeSlotSpec = Pick<
    DataAppVizField,
    'name' | 'type' | 'required' | 'multiple'
>;

const getCustomReferenceErrors = (
    check: ReferenceCheck,
    { fieldMapping }: ComposerCustomChartVizConfig,
    slots: ComposerCustomChartTypeSlotSpec[],
): string[] => {
    const slotNames = slots.map(({ name }) => name);
    const unknownSlots = Object.keys(fieldMapping).filter(
        (name) => !slotNames.includes(name),
    );
    const { split, values } = getCustomChartTypeReferences(fieldMapping, slots);
    return [
        ...unknownSlots.map(
            (name) =>
                `fieldMapping: "${name}" is not a slot of this chart type (slots: ${slotNames.join(', ')})`,
        ),
        ...slots
            .filter(
                ({ name, required }) =>
                    required &&
                    getDataAppVizFieldIds(fieldMapping[name]).length === 0,
            )
            .map(
                ({ name }) =>
                    `fieldMapping: required slot "${name}" is not bound`,
            ),
        ...slots
            .filter(({ name, multiple }) => {
                const value = fieldMapping[name];
                return !multiple && Array.isArray(value) && value.length > 1;
            })
            .map(({ name }) => `fieldMapping.${name}: slot takes one column`),
        ...getMissingReferenceErrors(
            check,
            Object.entries(fieldMapping).map(([name, value]) => [
                `fieldMapping.${name}`,
                getDataAppVizFieldIds(value),
            ]),
        ),
        ...getNonNumericErrors(check, 'metric slot', values),
        ...(split.length > 0 && values.length === 0
            ? ['fieldMapping: a series slot needs a column on a metric slot']
            : []),
    ];
};

/** Viz config references the node's columns cannot draw; empty when the config renders. */
export const getComposerVizConfigReferenceErrors = ({
    columns,
    vizConfig,
    customChartTypeSlots,
}: {
    columns: ComposerNodeColumn[];
    vizConfig: ComposerChartVizConfig;
    customChartTypeSlots: ComposerCustomChartTypeSlotSpec[];
}): string[] => {
    const check = toReferenceCheck(columns);
    return vizConfig.type === 'custom'
        ? getCustomReferenceErrors(check, vizConfig, customChartTypeSlots)
        : getBuiltinReferenceErrors(check, vizConfig);
};
