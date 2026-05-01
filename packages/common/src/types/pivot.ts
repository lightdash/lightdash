import type { PivotIndexColum } from '../visualizations/types';
import { type FieldType } from './field';
import { type ResultRow, type ResultValue } from './results';
import type { GroupByColumn, SortBy, ValuesColumn } from './sqlRunner';

/**
 * A dimension referenced only via sortBy — not a row-axis index, not a pivot
 * group-by, not a metric. Carried through group_by_query to drive ORDER BY
 * without surfacing as a chart series.
 *
 * `kind` decides which DENSE_RANK the dim feeds:
 *   - 'row'    — orders the x-axis / row_index (e.g. day-of-year ordering an
 *                alphabetical month name xField).
 *   - 'column' — orders the pivot columns / column_index (e.g. priority
 *                ordering a status groupBy).
 *
 * The two intents look identical at the SQL layer but differ for the user;
 * `kind` is set by the chart-config layer where the partnership signal lives.
 */
export type SortOnlyDimension = {
    reference: string;
    kind: 'row' | 'column';
};

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
    hiddenMetricFieldIds?: string[];
    visibleMetricFieldIds?: string[];
    columnTotals?: boolean;
    rowTotals?: boolean;
};

// Used in AsyncQueryService to execute pivoted queries
export type PivotConfiguration = {
    indexColumn: PivotIndexColum | PivotIndexColum[] | undefined;
    valuesColumns: ValuesColumn[];
    groupByColumns: GroupByColumn[] | undefined;
    sortBy: SortBy | undefined;
    /**
     * When true, metrics are displayed as rows instead of columns.
     * This affects column limit calculation - when metrics are rows,
     * we don't need to divide the column limit by the number of metrics.
     * Defaults to false for backward compatibility (SQL runner behavior).
     */
    metricsAsRows?: boolean;
    /**
     * Fields referenced only via sortBy that aren't on any axis or in pivot
     * columns. Items with `aggregation` are metrics/table calculations merged
     * into valuesColumns for sort-anchor CTEs; items without `aggregation`
     * are dimensions that ride through group_by_query to drive row_index or
     * column_index ORDER BY (per their `kind`). Both are excluded from
     * pivotDetails so they don't appear as chart series.
     */
    sortOnlyColumns?: Array<ValuesColumn | SortOnlyDimension>;
};

type Field =
    | { type: FieldType.METRIC; fieldId?: undefined }
    | { type: FieldType.DIMENSION; fieldId: string };

type FieldValue =
    | { type: 'value'; fieldId: string; value: ResultValue; colSpan: number }
    | { type: 'label'; fieldId: string };

type TitleField = null | {
    fieldId: string;
    direction: 'index' | 'header';
};

export type TotalField = null | {
    fieldId?: string;
};

type TotalValue = null | number;

type DataValue = null | ResultValue;

export type PivotColumn = {
    fieldId: string;
    baseId: string | undefined;
    underlyingId: string | undefined;
    columnType: string | undefined;
};

export type PivotData = {
    headerValueTypes: Field[];
    headerValues: FieldValue[][];

    indexValueTypes: Field[];
    indexValues: FieldValue[][];

    dataColumnCount: number;
    dataValues: DataValue[][];

    titleFields: TitleField[][];

    rowTotalFields?: TotalField[][];
    columnTotalFields?: TotalField[][];

    rowTotals?: TotalValue[][];
    columnTotals?: TotalValue[][];
    cellsCount: number;
    rowsCount: number;
    pivotConfig: PivotConfig;

    retrofitData: {
        allCombinedData: ResultRow[];
        pivotColumnInfo: PivotColumn[];
    };
    groupedSubtotals?: Record<string, Record<string, number>[]>;
};
