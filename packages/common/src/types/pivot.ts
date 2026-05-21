import type { PivotIndexColum } from '../visualizations/types';
import { type FieldType } from './field';
import { type ResultRow, type ResultValue } from './results';
import type { GroupByColumn, SortBy, ValuesColumn } from './sqlRunner';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
    hiddenMetricFieldIds?: string[];
    visibleMetricFieldIds?: string[];
    columnTotals?: boolean;
    rowTotals?: boolean;
    /**
     * Dimensions (row-index or pivot-column-header) hidden from the rendered
     * pivot and from exports. The dimension still participates in the
     * underlying query and can drive sort order; it just doesn't render and
     * is filtered out of CSV/XLSX. Mirrors `hiddenMetricFieldIds` for the
     * dimension side.
     */
    hiddenDimensionFieldIds?: string[];
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
     * Metrics/table calculations needed for sort anchor CTEs but not for display.
     * These are merged into valuesColumns for SQL generation in PivotQueryBuilder,
     * but excluded from pivotDetails so they don't appear as chart series.
     */
    sortOnlyColumns?: ValuesColumn[];
    /**
     * Dimensions referenced by ORDER BY but NOT spread into pivot columns.
     * Used when a user hides a dim that's part of `pivotConfig.columns` and has
     * a sort entry on it: the dim still ranks column order via the GROUP BY /
     * ORDER BY pipeline, but it doesn't become a pivot column header level.
     * Mirrors `sortOnlyColumns` (which serves the same purpose for metrics).
     */
    sortOnlyDimensions?: GroupByColumn[];
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
