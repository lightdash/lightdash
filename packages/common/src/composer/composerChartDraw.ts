import {
    DimensionType,
    FieldType,
    isMetric,
    isTableCalculation,
    type ItemsMap,
    type TableCalculation,
} from '../types/field';
import { type MetricQuery } from '../types/metricQuery';
import { QuerySourceType } from '../types/querySources';
import { type ResultColumn, type ResultRow } from '../types/results';
import { ChartType, type ChartConfig } from '../types/savedCharts';
import assertUnreachable from '../utils/assertUnreachable';
import {
    type ComposerChartPipeline,
    type ComposerChartPipelineNode,
    type ComposerStoredChart,
} from './composerChart';
import {
    COMPOSER_RESULT_EXPLORE_NAME,
    ComposerResultColumns,
    getComposerPivotStage,
    getComposerResultQuery,
} from './composerResultChart';

/** What the classic chart builders draw a stored chart from; field ids are column names. */
export type ComposerChartDraw = {
    metricQuery: MetricQuery;
    fields: ItemsMap;
    chartConfig: ChartConfig;
    columnOrder: string[];
    /** Columns split into series; empty without a group-by. */
    pivotColumns: string[];
};

// The cap the builders' synthetic query reports; rows are capped by each node.
const DRAW_QUERY_LIMIT = 5000;

const missingColumnError = (reference: string) =>
    new Error(`Column "${reference}" is missing from the result`);

const notNumericError = (reference: string) =>
    new Error(`Column "${reference}" is no longer numeric`);

const columnsWithRole = (chart: ComposerStoredChart, fieldType: FieldType) =>
    chart.columns
        .filter((column) => column.fieldType === fieldType)
        .map(({ reference }) => reference);

/** Group-by columns the chart can split by; only cartesian charts split into series. */
const getSplitColumns = (chart: ComposerStoredChart) => ({
    columns: chart.pivotConfig?.columns ?? [],
    drawable: chart.chartConfig.type === ChartType.CARTESIAN,
});

const getTerminalNode = (pipeline: ComposerChartPipeline) => {
    const node = pipeline.nodes.find(
        ({ nodeId }) => nodeId === pipeline.terminalNodeId,
    );
    if (!node) {
        throw new Error(
            `Composer chart has no terminal node "${pipeline.terminalNodeId}"`,
        );
    }
    return node;
};

/** Fields of a semantic-layer or merge result: the run's own items, named by column. */
const getItemsQuery = (
    chart: ComposerStoredChart,
    columns: ResultColumn[],
    fields: ItemsMap,
    base: Pick<MetricQuery, 'exploreName' | 'sorts'>,
) => {
    const columnsByName = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const chartFields: ItemsMap = {};
    const dimensions: string[] = [];
    const metrics: string[] = [];
    const tableCalculations: TableCalculation[] = [];
    chart.columns.forEach(({ reference, fieldType }) => {
        const item = fields[reference];
        const column = columnsByName.get(reference);
        if (!item || !column) throw missingColumnError(reference);
        if (
            fieldType === FieldType.METRIC &&
            !isMetric(item) &&
            column.type !== DimensionType.NUMBER
        ) {
            throw notNumericError(reference);
        }
        chartFields[reference] = item;
        if (isTableCalculation(item)) tableCalculations.push(item);
        else if (isMetric(item)) metrics.push(reference);
        else dimensions.push(reference);
    });
    return {
        metricQuery: {
            ...base,
            dimensions,
            metrics,
            filters: {},
            limit: DRAW_QUERY_LIMIT,
            tableCalculations,
        },
        fields: chartFields,
    };
};

/** Fields of a sql, duckdb or python result: built per column under the <composer> table, by stored role. */
const getResultColumnsQuery = (
    chart: ComposerStoredChart,
    columns: ResultColumn[],
) => {
    const resultColumns = new ComposerResultColumns(columns);
    const names = new Set(resultColumns.references);
    chart.columns.forEach(({ reference }) => {
        if (!names.has(reference)) throw missingColumnError(reference);
    });
    const metrics = columnsWithRole(chart, FieldType.METRIC);
    metrics.forEach((reference) => {
        if (!resultColumns.isNumeric(reference)) {
            throw notNumericError(reference);
        }
    });
    return getComposerResultQuery(
        resultColumns,
        columnsWithRole(chart, FieldType.DIMENSION),
        metrics,
    );
};

const assertDrawablePivot = (chart: ComposerStoredChart) => {
    const split = getSplitColumns(chart);
    if (split.columns.length > 0 && !split.drawable) {
        throw new Error(
            'Group-by is only drawn on bar, line, area and scatter charts',
        );
    }
};

/**
 * The builder input for a stored chart over its terminal node's run. Throws a
 * named error when the run no longer fits the chart; extra columns are ignored.
 */
export const getComposerChartDraw = ({
    pipeline,
    chart,
    columns,
    fields,
}: {
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChart;
    /** The terminal node's result columns. */
    columns: ResultColumn[];
    /** The run's fields map for the terminal node. */
    fields: ItemsMap;
}): ComposerChartDraw => {
    assertDrawablePivot(chart);
    const node = getTerminalNode(pipeline);
    const query = (() => {
        switch (node.sourceType) {
            case QuerySourceType.SEMANTIC_LAYER:
                return getItemsQuery(chart, columns, fields, {
                    exploreName: node.exploreName,
                    sorts: node.sorts ?? [],
                });
            case QuerySourceType.MERGE:
                return getItemsQuery(chart, columns, fields, {
                    exploreName: COMPOSER_RESULT_EXPLORE_NAME,
                    sorts: [],
                });
            case QuerySourceType.SQL:
            case QuerySourceType.DUCKDB:
            case QuerySourceType.PYTHON:
                return getResultColumnsQuery(chart, columns);
            default:
                return assertUnreachable(node, 'Unknown composer node kind');
        }
    })();
    const { dimensions, metrics } = query.metricQuery;
    return {
        ...query,
        chartConfig: chart.chartConfig,
        columnOrder:
            chart.tableConfig.columnOrder.length > 0
                ? chart.tableConfig.columnOrder
                : [...dimensions, ...metrics],
        pivotColumns: chart.pivotConfig?.columns ?? [],
    };
};

/** Rows reduced to the chart's columns: builders read any extra key as data (funnel labels). */
export const pickComposerChartRows = (
    draw: ComposerChartDraw,
    rows: ResultRow[],
): ResultRow[] => {
    const ids = Object.keys(draw.fields);
    return rows.map((row) =>
        Object.fromEntries(
            ids.filter((id) => id in row).map((id) => [id, row[id]]),
        ),
    );
};

const CHART_STAGE_NODE_ID = 'chart_stage';

/**
 * The series-split stage the server runs after the terminal node, built from
 * the stored columns and pivotConfig alone; null without a drawable group-by.
 */
export const getComposerChartPivotStage = (
    pipeline: ComposerChartPipeline,
    chart: ComposerStoredChart,
): ComposerChartPipelineNode | null => {
    const split = getSplitColumns(chart);
    if (split.columns.length === 0 || !split.drawable) return null;
    const pivotColumns = split.columns;
    const nodeIds = new Set(pipeline.nodes.map(({ nodeId }) => nodeId));
    let nodeId = CHART_STAGE_NODE_ID;
    while (nodeIds.has(nodeId)) nodeId = `_${nodeId}`;
    const stage = getComposerPivotStage({
        indexColumns: columnsWithRole(chart, FieldType.DIMENSION).filter(
            (reference) => !pivotColumns.includes(reference),
        ),
        pivotColumns,
        valueColumns: columnsWithRole(chart, FieldType.METRIC),
        nodeId,
        source: pipeline.terminalNodeId,
    });
    return { ...stage, nodeId, title: 'Series split' };
};
