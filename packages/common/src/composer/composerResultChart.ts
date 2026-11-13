import { derivePivotConfigurationFromChart } from '../pivot/derivePivotConfigFromChart';
import {
    DimensionType,
    FieldType,
    friendlyName,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
} from '../types/field';
import { type MetricQuery, type SortField } from '../types/metricQuery';
import {
    QuerySourceType,
    type DuckdbSourceQuery,
    type QueryNodeId,
    type SourceQuery,
} from '../types/querySources';
import { type ResultColumn } from '../types/results';
import { type ChartConfig } from '../types/savedCharts';
import { TimeFrames } from '../types/timeFrames';
import { getItemId, RESULT_COLUMN_TABLE } from '../utils/item';

/** Synthetic explore of a composer node result; its fields are the result columns. */
export const COMPOSER_RESULT_EXPLORE_NAME = 'composer_result';

export const getComposerResultFieldId = (reference: string): string =>
    getItemId({ table: RESULT_COLUMN_TABLE, name: reference });

// Day-or-coarser truncations are calendar dates, though result columns
// report the warehouse's timestamp type.
const CALENDAR_TIME_FRAMES: (TimeFrames | undefined)[] = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

const toDimensionType = (column: ResultColumn): DimensionType =>
    column.type === DimensionType.TIMESTAMP &&
    CALENDAR_TIME_FRAMES.includes(column.timeInterval)
        ? DimensionType.DATE
        : column.type;

const toFieldBase = (column: ResultColumn) => ({
    table: RESULT_COLUMN_TABLE,
    name: column.reference,
    label: column.label ?? friendlyName(column.reference),
    tableLabel: '',
    sql: '',
    hidden: false,
    ...(column.format ? { format: column.format } : {}),
});

const toComposerResultDimension = (column: ResultColumn): Dimension => ({
    ...toFieldBase(column),
    fieldType: FieldType.DIMENSION,
    type: toDimensionType(column),
    ...(column.timeInterval ? { timeInterval: column.timeInterval } : {}),
});

export const toComposerResultMetric = (column: ResultColumn): Metric => ({
    ...toFieldBase(column),
    fieldType: FieldType.METRIC,
    type: MetricType.NUMBER,
});

const unique = (values: string[]) => [...new Set(values)];

/** Result columns by reference; rejects references that would share a field id. */
export class ComposerResultColumns {
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

export type ComposerResultQuery = {
    metricQuery: MetricQuery;
    fields: ItemsMap;
};

/** The synthetic query and fields over result columns; everything downstream reads field ids. */
export const getComposerResultQuery = (
    columns: ComposerResultColumns,
    dimensions: string[],
    metrics: string[],
): ComposerResultQuery => {
    const fields: ItemsMap = {};
    dimensions.forEach((reference) => {
        fields[getComposerResultFieldId(reference)] = toComposerResultDimension(
            columns.get(reference),
        );
    });
    metrics.forEach((reference) => {
        fields[getComposerResultFieldId(reference)] = toComposerResultMetric(
            columns.get(reference),
        );
    });
    return {
        metricQuery: {
            exploreName: COMPOSER_RESULT_EXPLORE_NAME,
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

/** Row keys renamed to field ids, keeping only the chart's fields: builders treat any extra key as data (funnel labels). */
export const toComposerResultRows = <Value>(
    chart: ComposerResultQuery,
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

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

const PIVOT_STAGE_SOURCE_NAME = 'node_result';

/** A series split as a classic chart over field ids, with its column references by role. */
export type ComposerSplitChart = {
    chartConfig: ChartConfig;
    /** Split into series; among the dimensions. */
    pivotColumns: string[];
    dimensions: string[];
    metrics: string[];
};

/** The node's sorts by field id; only semantic-layer nodes declare them. */
export const getComposerNodeSorts = (node: SourceQuery): SortField[] =>
    node.sourceType === QuerySourceType.SEMANTIC_LAYER
        ? (node.sorts ?? [])
        : [];

/**
 * The series-split stage over source (a node id or result query uuid): columns
 * renamed to field ids, pivoted by the classic derivation; null when none derives.
 */
export const getComposerSplitStage = ({
    chartConfig,
    pivotColumns,
    dimensions,
    metrics,
    sorts,
    nodeId,
    source,
}: ComposerSplitChart & {
    sorts: SortField[];
    nodeId: QueryNodeId;
    source: string;
}): DuckdbSourceQuery | null => {
    const fieldId = getComposerResultFieldId;
    const references = unique([...dimensions, ...metrics]);
    // Types are unknown before the run: the axis type comes from the chart.
    const { metricQuery, fields } = getComposerResultQuery(
        new ComposerResultColumns(
            references.map((reference) => ({
                reference,
                type: metrics.includes(reference)
                    ? DimensionType.NUMBER
                    : DimensionType.STRING,
            })),
        ),
        dimensions.filter((reference) => !metrics.includes(reference)),
        metrics,
    );
    const pivotConfiguration = derivePivotConfigurationFromChart(
        { chartConfig, pivotConfig: { columns: pivotColumns.map(fieldId) } },
        { ...metricQuery, sorts },
        fields,
    );
    if (!pivotConfiguration) return null;
    return {
        sourceType: QuerySourceType.DUCKDB,
        nodeId,
        sql: `SELECT ${references
            .map(
                (reference) =>
                    `${quoteIdentifier(reference)} AS ${quoteIdentifier(fieldId(reference))}`,
            )
            .join(', ')} FROM ${quoteIdentifier(PIVOT_STAGE_SOURCE_NAME)}`,
        references: { [PIVOT_STAGE_SOURCE_NAME]: source },
        pivotConfiguration,
    };
};
