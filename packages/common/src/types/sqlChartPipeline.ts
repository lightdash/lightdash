import {
    AxisSide,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
    SortByDirection,
    StackType,
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
    type PivotChartLayout,
} from '../visualizations/types';
import { DimensionType, FieldType, friendlyName } from './field';
import { type MetricQuery, type SortField } from './metricQuery';
import {
    QuerySourceType,
    type DuckdbSourceQuery,
    type QueryNodeId,
    type SqlSourceQuery,
} from './querySources';
import { type ResultColumn, type ResultColumns } from './results';
import {
    CartesianSeriesType,
    ChartKind,
    ChartType,
    type ChartConfig,
    type Series,
} from './savedCharts';
import { type SavedPipelineDefinition } from './savedPipeline';

/** The node a SQL chart's statement runs as. */
export const SQL_CHART_NODE_ID: QueryNodeId = 'sql';
/** The node that aggregates the statement's rows the way the SQL runner chart did. */
export const SQL_CHART_AGGREGATE_NODE_ID: QueryNodeId = 'aggregated';

export type SqlChartAsPipelineChart = {
    pipeline: SavedPipelineDefinition;
    tableName: string;
    metricQuery: MetricQuery;
    chartConfig: ChartConfig;
    pivotConfig: { columns: string[] } | undefined;
    tableConfig: { columnOrder: string[] };
};

const quoteIdentifier = (identifier: string) =>
    `"${identifier.replace(/"/g, '""')}"`;

const fieldIdOf = (nodeId: string, reference: string) =>
    `${nodeId}_${reference}`;

/** The SQL runner named an aggregated value `<column>_<aggregation>`. */
export const sqlChartAggregatedReference = (
    reference: string,
    aggregation: VizAggregationOptions,
): string => `${reference}_${aggregation}`;

const aggregationSql = (
    aggregation: VizAggregationOptions,
    column: string,
): string => {
    switch (aggregation) {
        case VizAggregationOptions.SUM:
            return `SUM(${column})`;
        case VizAggregationOptions.COUNT:
            return `COUNT(${column})`;
        case VizAggregationOptions.AVERAGE:
            return `AVG(${column})`;
        case VizAggregationOptions.MIN:
            return `MIN(${column})`;
        case VizAggregationOptions.MAX:
            return `MAX(${column})`;
        case VizAggregationOptions.ANY:
            return `ANY_VALUE(${column})`;
        default:
            return `ANY_VALUE(${column})`;
    }
};

const columnOf = (
    reference: string,
    type: DimensionType,
    fieldType: FieldType,
    discovered: ResultColumn | undefined,
    label?: string,
): ResultColumn => ({
    ...(discovered ?? {}),
    reference,
    type: discovered?.type ?? type,
    label: label ?? discovered?.label ?? friendlyName(reference),
    provenance: { fieldId: reference, fieldType },
});

const indexType = (type: VizIndexType | undefined): DimensionType =>
    type === VizIndexType.TIME ? DimensionType.DATE : DimensionType.STRING;

const legendAlign = (
    align: 'start' | 'center' | 'end',
): 'left' | 'right' | 'auto' => {
    if (align === 'start') return 'left';
    if (align === 'end') return 'right';
    return 'auto';
};

const isStacked = (stack: boolean | StackType | undefined): boolean =>
    stack === true || stack === StackType.NORMAL || stack === StackType.PERCENT;

/**
 * The aggregating node and its columns for a chart layout: one row per x
 * (and per series split), each value aggregated the way the SQL runner did
 * at draw time. Aggregation belongs in the query, so it becomes a node.
 */
const buildAggregateNode = (
    layout: PivotChartLayout,
    discovered: ResultColumns | undefined,
): { node: DuckdbSourceQuery; columns: ResultColumns } => {
    const groupColumns = [
        ...(layout.x ? [layout.x.reference] : []),
        ...(layout.groupBy ?? []).map((group) => group.reference),
    ];
    const seen = new Set<string>();
    const values = layout.y.flatMap((value) => {
        const alias = sqlChartAggregatedReference(
            value.reference,
            value.aggregation,
        );
        if (seen.has(alias)) return [];
        seen.add(alias);
        return [{ ...value, alias }];
    });
    const select = [
        ...groupColumns.map(
            (column) =>
                `${quoteIdentifier(column)} AS ${quoteIdentifier(column)}`,
        ),
        ...values.map(
            (value) =>
                `${aggregationSql(
                    value.aggregation,
                    quoteIdentifier(value.reference),
                )} AS ${quoteIdentifier(value.alias)}`,
        ),
    ].join(', ');
    const groupBy =
        groupColumns.length > 0
            ? ` GROUP BY ${groupColumns.map(quoteIdentifier).join(', ')}`
            : '';
    const entries: [string, ResultColumn][] = [
        ...groupColumns.map((column, index): [string, ResultColumn] => [
            column,
            columnOf(
                column,
                index === 0 && layout.x
                    ? indexType(layout.x.type)
                    : DimensionType.STRING,
                FieldType.DIMENSION,
                discovered?.[column],
            ),
        ]),
        ...values.map((value): [string, ResultColumn] => [
            value.alias,
            columnOf(
                value.alias,
                DimensionType.NUMBER,
                FieldType.METRIC,
                value.aggregation === VizAggregationOptions.COUNT
                    ? undefined
                    : discovered?.[value.reference],
                `${discovered?.[value.reference]?.label ?? friendlyName(value.reference)} (${value.aggregation})`,
            ),
        ]),
    ];
    const columns: ResultColumns = Object.fromEntries(entries);
    return {
        node: {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: SQL_CHART_AGGREGATE_NODE_ID,
            title: 'Aggregated',
            sql: `SELECT ${select} FROM ${quoteIdentifier(SQL_CHART_NODE_ID)}${groupBy}`,
            references: [SQL_CHART_NODE_ID],
        },
        columns,
    };
};

const sortsOf = (
    layout: PivotChartLayout,
    nodeId: string,
    known: Set<string>,
): SortField[] =>
    (layout.sortBy ?? []).flatMap((sort) => {
        // A sort names the raw column or the aggregated value
        const alias = layout.y.find(
            (value) => value.reference === sort.reference,
        )
            ? sqlChartAggregatedReference(
                  sort.reference,
                  layout.y.find((value) => value.reference === sort.reference)!
                      .aggregation,
              )
            : sort.reference;
        const reference = known.has(alias) ? alias : sort.reference;
        if (!known.has(reference)) return [];
        return [
            {
                fieldId: fieldIdOf(nodeId, reference),
                descending: sort.direction === SortByDirection.DESC,
                ...(sort.nullsFirst !== undefined
                    ? { nullsFirst: sort.nullsFirst }
                    : {}),
            },
        ];
    });

/**
 * A SQL runner chart as a pipeline chart: the statement as a SQL node, an
 * aggregating node when the chart aggregated at draw time, and the
 * explorer's chart config over the terminal columns. `columns` are the
 * statement's result columns when known (a save from the SQL runner has
 * them); without them the SQL node's columns are discovered when it runs.
 */
export const convertSqlChartToPipelineChart = ({
    sql,
    limit,
    config,
    columns: discovered,
    warehouseConnectionUuid,
}: {
    sql: string;
    limit: number;
    config: AllVizChartConfig;
    columns?: ResultColumns;
    warehouseConnectionUuid?: string | null;
}): SqlChartAsPipelineChart => {
    const sqlNode: SqlSourceQuery = {
        sourceType: QuerySourceType.SQL,
        nodeId: SQL_CHART_NODE_ID,
        title: 'SQL',
        sql,
        limit,
        ...(warehouseConnectionUuid ? { warehouseConnectionUuid } : {}),
    };
    const layout =
        'fieldConfig' in config && config.fieldConfig
            ? config.fieldConfig
            : undefined;

    if (isVizTableConfig(config) || !layout || layout.y.length === 0) {
        // A table (or a chart without a layout) draws the statement's rows
        const nodeId = SQL_CHART_NODE_ID;
        const configured = isVizTableConfig(config)
            ? Object.values(config.columns ?? {})
            : [];
        const columns: ResultColumns =
            discovered ??
            Object.fromEntries(
                configured.map((column) => [
                    column.reference,
                    columnOf(
                        column.reference,
                        DimensionType.STRING,
                        FieldType.DIMENSION,
                        undefined,
                        column.label,
                    ),
                ]),
            );
        const ordered = [...configured]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((column) => column.reference)
            .filter((reference) => columns[reference] !== undefined);
        const references = [
            ...ordered,
            ...Object.keys(columns).filter(
                (reference) => !ordered.includes(reference),
            ),
        ];
        const fieldIds = references.map((reference) =>
            fieldIdOf(nodeId, reference),
        );
        const metricRefs = references.filter(
            (reference) =>
                columns[reference].provenance?.fieldType === FieldType.METRIC ||
                (columns[reference].provenance?.fieldType === undefined &&
                    columns[reference].type === DimensionType.NUMBER),
        );
        return {
            pipeline: { queries: [sqlNode], terminalNodeId: nodeId, columns },
            tableName: nodeId,
            metricQuery: {
                exploreName: nodeId,
                dimensions: references
                    .filter((reference) => !metricRefs.includes(reference))
                    .map((reference) => fieldIdOf(nodeId, reference)),
                metrics: metricRefs.map((reference) =>
                    fieldIdOf(nodeId, reference),
                ),
                filters: {},
                sorts: [],
                limit,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    columns: Object.fromEntries(
                        configured.map((column) => [
                            fieldIdOf(nodeId, column.reference),
                            {
                                visible: column.visible,
                                name: column.label,
                                frozen: column.frozen,
                                ...(column.displayStyle
                                    ? { displayStyle: column.displayStyle }
                                    : {}),
                            },
                        ]),
                    ),
                },
            },
            pivotConfig: undefined,
            tableConfig: { columnOrder: fieldIds },
        };
    }

    const { node, columns } = buildAggregateNode(layout, discovered);
    const nodeId = node.nodeId!;
    const fieldId = (reference: string) => fieldIdOf(nodeId, reference);
    const known = new Set(Object.keys(columns));
    const xField = layout.x ? fieldId(layout.x.reference) : undefined;
    const groupFields = (layout.groupBy ?? []).map((group) =>
        fieldId(group.reference),
    );
    const valueFields = [
        ...new Set(
            layout.y.map((value) =>
                fieldId(
                    sqlChartAggregatedReference(
                        value.reference,
                        value.aggregation,
                    ),
                ),
            ),
        ),
    ];
    const dimensions = [...(xField ? [xField] : []), ...groupFields];
    const metricQuery: MetricQuery = {
        exploreName: nodeId,
        dimensions,
        metrics: valueFields,
        filters: {},
        sorts: sortsOf(layout, nodeId, known),
        limit,
        tableCalculations: [],
    };
    const pipeline: SavedPipelineDefinition = {
        queries: [sqlNode, node],
        terminalNodeId: nodeId,
        columns,
    };
    const base = {
        pipeline,
        tableName: nodeId,
        metricQuery,
        tableConfig: { columnOrder: [...dimensions, ...valueFields] },
        pivotConfig:
            groupFields.length > 0 ? { columns: groupFields } : undefined,
    };

    if (isVizPieChartConfig(config)) {
        return {
            ...base,
            chartConfig: {
                type: ChartType.PIE,
                config: {
                    groupFieldIds: dimensions,
                    metricId: valueFields[0],
                    isDonut: config.display?.isDonut,
                },
            },
        };
    }
    if (config.type === ChartKind.BIG_NUMBER) {
        const { display } = config;
        return {
            ...base,
            pivotConfig: undefined,
            chartConfig: {
                type: ChartType.BIG_NUMBER,
                config: {
                    selectedField: valueFields[0],
                    label: display?.label,
                    style: display?.style,
                    showBigNumberLabel: display?.showLabel,
                    showComparison: display?.showComparison,
                    comparisonFormat: display?.comparisonFormat,
                    comparisonLabel: display?.comparisonLabel,
                    flipColors: display?.flipColors,
                },
            },
        };
    }
    const display =
        isVizBarChartConfig(config) || isVizLineChartConfig(config)
            ? config.display
            : undefined;
    const stacked = isStacked(display?.stack ?? layout.stack);
    const seriesType = isVizLineChartConfig(config)
        ? CartesianSeriesType.LINE
        : CartesianSeriesType.BAR;
    const series: Series[] = layout.y.map((value) => {
        const alias = sqlChartAggregatedReference(
            value.reference,
            value.aggregation,
        );
        const style =
            display?.series?.[alias] ?? display?.series?.[value.reference];
        return {
            type: style?.type ?? seriesType,
            encode: {
                xRef: { field: xField ?? '' },
                yRef: { field: fieldId(alias) },
            },
            ...(stacked ? { stack: 'stack' } : {}),
            ...(style?.label ? { name: style.label } : {}),
            ...(style?.color ? { color: style.color } : {}),
            ...(style?.whichYAxis === AxisSide.RIGHT ? { yAxisIndex: 1 } : {}),
            ...(style?.valueLabelPosition &&
            style.valueLabelPosition !== 'hidden'
                ? {
                      label: {
                          show: true,
                          position: style.valueLabelPosition,
                          ...(style.valueLabelColor
                              ? { color: style.valueLabelColor }
                              : {}),
                      },
                  }
                : {}),
        };
    });
    return {
        ...base,
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField,
                    yField: valueFields,
                },
                eChartsConfig: {
                    series,
                    xAxis: [{ name: display?.xAxis?.label }],
                    yAxis: [
                        { name: display?.yAxis?.[0]?.label },
                        { name: display?.yAxis?.[1]?.label },
                    ],
                    ...(display?.legend
                        ? {
                              legend: {
                                  show: true,
                                  [display.legend.position]: 0,
                                  align: legendAlign(display.legend.align),
                              },
                          }
                        : {}),
                },
            },
        },
    };
};

export type SqlChartSource = {
    sql: string;
    limit: number;
    warehouseConnectionUuid: string | null;
};

/**
 * The pipeline a SQL runner chart saves: one SQL node that is the terminal,
 * with the statement's result columns as the chart's fields.
 */
export const buildSqlChartPipeline = ({
    sql,
    limit,
    columns,
    warehouseConnectionUuid,
}: SqlChartSource & { columns: ResultColumns }): SavedPipelineDefinition => ({
    queries: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: SQL_CHART_NODE_ID,
            title: 'SQL',
            sql,
            limit,
            ...(warehouseConnectionUuid ? { warehouseConnectionUuid } : {}),
        },
    ],
    terminalNodeId: SQL_CHART_NODE_ID,
    columns,
});

/**
 * The statement a pipeline chart edits in the SQL runner: a pipeline of one
 * SQL node that is the terminal. Null for every other pipeline, whose nodes
 * the SQL runner cannot edit (a composer pipeline, or a folded SQL chart
 * that aggregated at draw time and so carries an aggregating node).
 */
export const getPipelineSqlChartSource = (
    pipeline: Pick<SavedPipelineDefinition, 'queries' | 'terminalNodeId'>,
): SqlChartSource | null => {
    if (pipeline.queries.length !== 1) return null;
    const [node] = pipeline.queries;
    if (
        node.sourceType !== QuerySourceType.SQL ||
        node.nodeId !== pipeline.terminalNodeId
    )
        return null;
    return {
        sql: node.sql,
        limit: node.limit ?? 500,
        warehouseConnectionUuid: node.warehouseConnectionUuid ?? null,
    };
};

/** Pipeline rows at this schema version hold a SQL runner chart as it was saved, converted when read. */
export const SAVED_PIPELINE_LEGACY_SQL_SCHEMA_VERSION = 0;

export type LegacySqlChartPipeline = {
    sql: string;
    limit: number;
    config: AllVizChartConfig;
    warehouseConnectionUuid: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stored schema version 0 pipeline row, or null when its shape is not one. */
export const parseLegacySqlChartPipeline = (
    value: unknown,
): LegacySqlChartPipeline | null => {
    if (!isRecord(value)) return null;
    const { sql, limit, config, warehouseConnectionUuid } = value;
    if (typeof sql !== 'string') return null;
    if (!isRecord(config) || typeof config.type !== 'string') return null;
    return {
        sql,
        limit: typeof limit === 'number' ? limit : 500,
        config: config as AllVizChartConfig,
        warehouseConnectionUuid:
            typeof warehouseConnectionUuid === 'string'
                ? warehouseConnectionUuid
                : null,
    };
};

const stripFieldPrefix = (nodeId: string, fieldId: string): string =>
    fieldId.startsWith(`${nodeId}_`)
        ? fieldId.slice(nodeId.length + 1)
        : fieldId;

const splitAggregatedReference = (
    reference: string,
): { reference: string; aggregation: VizAggregationOptions } => {
    const aggregations = Object.values(VizAggregationOptions);
    const match = aggregations.find((aggregation) =>
        reference.endsWith(`_${aggregation}`),
    );
    return match
        ? {
              reference: reference.slice(0, -(match.length + 1)),
              aggregation: match,
          }
        : { reference, aggregation: VizAggregationOptions.ANY };
};

/**
 * The SQL runner shape of a pipeline chart whose pipeline is a SQL node, with
 * or without the aggregating node the SQL runner implied: the statement, the
 * limit, the connection and a `AllVizChartConfig` rebuilt from the explorer
 * config. Null when the pipeline is not that shape. Lossy where the explorer
 * config says more than the SQL runner could (series styling beyond color,
 * label and axis).
 */
export const convertPipelineChartToSqlChart = (chart: {
    pipeline: SavedPipelineDefinition;
    chartConfig: ChartConfig;
    pivotConfig?: { columns: string[] } | null;
    tableConfig: { columnOrder: string[] };
    metricQuery: Pick<MetricQuery, 'sorts' | 'limit'>;
}): {
    sql: string;
    limit: number;
    warehouseConnectionUuid: string | null;
    config: AllVizChartConfig;
} | null => {
    const { pipeline } = chart;
    const sqlNode = pipeline.queries.find(
        (node) =>
            node.nodeId === SQL_CHART_NODE_ID &&
            node.sourceType === QuerySourceType.SQL,
    );
    if (!sqlNode || sqlNode.sourceType !== QuerySourceType.SQL) return null;
    const aggregateNode = pipeline.queries.find(
        (node) => node.nodeId === SQL_CHART_AGGREGATE_NODE_ID,
    );
    const terminalIsKnown =
        pipeline.terminalNodeId === SQL_CHART_NODE_ID ||
        (aggregateNode !== undefined &&
            pipeline.terminalNodeId === SQL_CHART_AGGREGATE_NODE_ID);
    if (!terminalIsKnown) return null;
    const nodeId = pipeline.terminalNodeId;
    const limit = sqlNode.limit ?? chart.metricQuery.limit ?? 500;
    const base = {
        sql: sqlNode.sql,
        limit,
        warehouseConnectionUuid: sqlNode.warehouseConnectionUuid ?? null,
    };
    const metadata = { version: 1 };
    const column = (fieldId: string) => stripFieldPrefix(nodeId, fieldId);
    const sortBy = chart.metricQuery.sorts.map((sort) => ({
        reference: splitAggregatedReference(column(sort.fieldId)).reference,
        direction: sort.descending ? SortByDirection.DESC : SortByDirection.ASC,
        ...(sort.nullsFirst !== undefined
            ? { nullsFirst: sort.nullsFirst }
            : {}),
    }));
    const groupBy = chart.pivotConfig?.columns.map((fieldId) => ({
        reference: column(fieldId),
    }));
    const value = (fieldId: string) =>
        splitAggregatedReference(column(fieldId));

    switch (chart.chartConfig.type) {
        case ChartType.TABLE: {
            const columns = chart.chartConfig.config?.columns ?? {};
            return {
                ...base,
                config: {
                    metadata,
                    type: ChartKind.TABLE,
                    columns: Object.fromEntries(
                        chart.tableConfig.columnOrder.map((fieldId, order) => {
                            const reference = column(fieldId);
                            const properties = columns[fieldId];
                            return [
                                reference,
                                {
                                    visible: properties?.visible ?? true,
                                    reference,
                                    label:
                                        properties?.name ??
                                        friendlyName(reference),
                                    frozen: properties?.frozen ?? false,
                                    order,
                                    ...(properties?.displayStyle
                                        ? {
                                              displayStyle:
                                                  properties.displayStyle,
                                          }
                                        : {}),
                                },
                            ];
                        }),
                    ),
                    display: undefined,
                },
            };
        }
        case ChartType.BIG_NUMBER: {
            const config = chart.chartConfig.config ?? {};
            const selected = config.selectedField
                ? [value(config.selectedField)]
                : [];
            return {
                ...base,
                config: {
                    metadata,
                    type: ChartKind.BIG_NUMBER,
                    fieldConfig: {
                        x: undefined,
                        y: selected,
                        groupBy: undefined,
                        sortBy,
                    },
                    display: {
                        label: config.label,
                        style: config.style,
                        showLabel: config.showBigNumberLabel,
                        showComparison: config.showComparison,
                        comparisonFormat: config.comparisonFormat,
                        comparisonLabel: config.comparisonLabel,
                        flipColors: config.flipColors,
                    },
                },
            };
        }
        case ChartType.PIE: {
            const config = chart.chartConfig.config ?? {};
            const [x, ...rest] = config.groupFieldIds ?? [];
            return {
                ...base,
                config: {
                    metadata,
                    type: ChartKind.PIE,
                    fieldConfig: {
                        x: x
                            ? {
                                  reference: column(x),
                                  type: VizIndexType.CATEGORY,
                              }
                            : undefined,
                        y: config.metricId ? [value(config.metricId)] : [],
                        groupBy:
                            rest.length > 0
                                ? rest.map((fieldId) => ({
                                      reference: column(fieldId),
                                  }))
                                : groupBy,
                        sortBy,
                    },
                    display: { isDonut: config.isDonut },
                },
            };
        }
        case ChartType.CARTESIAN: {
            const { config } = chart.chartConfig;
            const layout = config?.layout;
            const series = config?.eChartsConfig.series ?? [];
            const xField = layout?.xField;
            const xColumn = xField
                ? pipeline.columns[column(xField)]
                : undefined;
            const isLine = series.every(
                (entry) => entry.type === CartesianSeriesType.LINE,
            );
            const yFields = layout?.yField ?? [];
            return {
                ...base,
                config: {
                    metadata,
                    type: isLine ? ChartKind.LINE : ChartKind.VERTICAL_BAR,
                    fieldConfig: {
                        x: xField
                            ? {
                                  reference: column(xField),
                                  type:
                                      xColumn?.type === DimensionType.DATE ||
                                      xColumn?.type === DimensionType.TIMESTAMP
                                          ? VizIndexType.TIME
                                          : VizIndexType.CATEGORY,
                              }
                            : undefined,
                        y: yFields.map(value),
                        groupBy,
                        sortBy,
                        stack: series.some(
                            (entry) => entry.stack !== undefined,
                        ),
                    },
                    display: {
                        xAxis: {
                            label: config?.eChartsConfig.xAxis?.[0]?.name,
                        },
                        yAxis: (config?.eChartsConfig.yAxis ?? []).map(
                            (axis) => ({
                                label: axis.name,
                            }),
                        ),
                        series: Object.fromEntries(
                            series.flatMap((entry) => {
                                const key = column(entry.encode.yRef.field);
                                if (
                                    !entry.color &&
                                    !entry.name &&
                                    entry.yAxisIndex !== 1
                                )
                                    return [];
                                return [
                                    [
                                        key,
                                        {
                                            ...(entry.color
                                                ? { color: entry.color }
                                                : {}),
                                            ...(entry.name
                                                ? { label: entry.name }
                                                : {}),
                                            ...(entry.yAxisIndex === 1
                                                ? { whichYAxis: AxisSide.RIGHT }
                                                : {}),
                                        },
                                    ],
                                ];
                            }),
                        ),
                        stack: series.some(
                            (entry) => entry.stack !== undefined,
                        ),
                    },
                },
            };
        }
        default:
            return null;
    }
};
