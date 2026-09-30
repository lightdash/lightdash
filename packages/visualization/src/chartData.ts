import {
    FieldType,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type ChartConfig,
    type CompactOrAlias,
    type CustomFormat,
    type Dimension,
    type DimensionType,
    type Format,
    type ItemsMap,
    type MergeFieldOrigins,
    type Metric,
    type MetricQuery,
    type MetricType,
    type PivotData,
    type ReadyQueryResultsPage,
    type ResultRow,
    type TableCalculation,
    type TimeFrames,
} from '@lightdash/common';
import { type VisualizationResults } from './types';

/**
 * What a chart is: the parts of a saved chart that decide how its data is
 * drawn. A `SavedChart` from the API satisfies it as it is.
 */
export type ChartView = {
    /** The chart type and its per-type configuration. */
    chartConfig: ChartConfig;
    /** The dimensions the results were pivoted by, as columns and rows. */
    pivotConfig?: { columns: string[]; rows?: string[] };
    /** The order the fields show in, as the explorer's results table has them. */
    tableConfig?: { columnOrder: string[] };
};

/**
 * A field of the data, as the engine needs it to label and format values.
 * Every Lightdash item (dimension, metric, table calculation, custom
 * dimension) already is one; a caller without Lightdash's field objects
 * gives just the type, the label and the format.
 */
export type ChartFieldDefinition = {
    fieldType: FieldType;
    type: DimensionType | MetricType | `${DimensionType}` | `${MetricType}`;
    label: string;
    tableLabel?: string;
    /** How values format: a format name (`usd`, `percent`) or a format expression. */
    format?: Format | string;
    round?: number;
    compact?: CompactOrAlias;
    formatOptions?: CustomFormat;
    /** The time frame of a date dimension (`MONTH`, `WEEK`...), for axis labels. */
    timeInterval?: TimeFrames;
    /** The date dimension a time frame was cut from. */
    timeIntervalBaseDimensionType?: DimensionType;
    /** Fixed colours for some values of a dimension. */
    colors?: Record<string, string>;
};

export type ChartField = ItemsMap[string] | ChartFieldDefinition;

/** The fields of the data, keyed by field id: the key is the id the rows use. */
export type ChartFields = Record<string, ChartField>;

/**
 * The fields the query selected, in order, and how it sorted. Callers with
 * a Lightdash metric query pass it as it is; without one it is read off the
 * fields: dimensions and metrics in the fields' order, no sorts.
 */
export type ChartQuery = Pick<MetricQuery, 'dimensions' | 'metrics'> &
    Partial<
        Pick<
            MetricQuery,
            'tableCalculations' | 'sorts' | 'exploreName' | 'filters' | 'limit'
        >
    >;

/**
 * Everything a chart is drawn from, all of it data: the rows, the fields
 * that describe them, and the values that took further queries. The engine
 * never runs a query; a value it needs and is not given is reported, never
 * fetched.
 */
export type ChartData = {
    /** The rows, keyed by field id, each value raw and formatted (see `toResultRows`). */
    rows: ResultRow[];
    fields: ChartFields;
    query?: ChartQuery;
    /** How a pivoted result's columns map back to fields and pivot values. */
    pivotDetails?: ReadyQueryResultsPage['pivotDetails'];
    /** The display timezone the query ran with (`resolvedTimezone` in the API). */
    timezone?: string | null;
    /** Where each field came from, when the results are a merge of two queries. */
    fieldOrigins?: MergeFieldOrigins;
    /** Column totals, for a table showing them. */
    totals?: Record<string, number>;
    /** Subtotals of each grouping level, for a table's or a treemap's groups. */
    groupedSubtotals?: Record<string, Record<string, number>[]>;
    /** The pivoted table, for a table with pivot columns. */
    pivotTable?: PivotData;
};

const isFieldDefinition = (field: ChartField): field is ChartFieldDefinition =>
    !('name' in field);

/**
 * The fields as Lightdash items: a definition becomes the dimension or
 * metric it describes, named by its key. Items pass through unchanged.
 */
export const toItemsMap = (fields: ChartFields): ItemsMap =>
    Object.fromEntries(
        Object.entries(fields).map(([fieldId, field]) => {
            if (!isFieldDefinition(field)) return [fieldId, field];
            const base = {
                ...field,
                name: fieldId,
                table: '',
                tableLabel: field.tableLabel ?? '',
                sql: '',
                hidden: false,
            };
            return [
                fieldId,
                field.fieldType === FieldType.DIMENSION
                    ? ({ ...base, fieldType: FieldType.DIMENSION } as Dimension)
                    : ({ ...base, fieldType: FieldType.METRIC } as Metric),
            ];
        }),
    );

/** The query the fields imply when the caller has none: dimensions then metrics, in the fields' order. */
const queryOf = (itemsMap: ItemsMap): ChartQuery => {
    const entries = Object.entries(itemsMap);
    return {
        dimensions: entries
            .filter(([, item]) => isDimension(item) || isCustomDimension(item))
            .map(([fieldId]) => fieldId),
        metrics: entries
            .filter(([, item]) => isMetric(item))
            .map(([fieldId]) => fieldId),
        tableCalculations: entries
            .filter(([, item]) => isTableCalculation(item))
            .map(([, item]) => item as TableCalculation),
    };
};

/** The results the chart builders read, from the chart data. */
export const toVisualizationResults = (
    data: ChartData,
    itemsMap: ItemsMap,
): VisualizationResults => {
    const query = data.query ?? queryOf(itemsMap);
    return {
        rows: data.rows,
        metricQuery: {
            exploreName: query.exploreName ?? '',
            dimensions: query.dimensions,
            metrics: query.metrics,
            tableCalculations: query.tableCalculations ?? [],
            sorts: query.sorts ?? [],
            filters: query.filters ?? {},
            limit: query.limit ?? data.rows.length,
        },
        pivotDetails: data.pivotDetails ?? null,
        resolvedTimezone: data.timezone ?? undefined,
        fieldOrigins: data.fieldOrigins,
        hasFetchedAllRows: true,
    };
};
