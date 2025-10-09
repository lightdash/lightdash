import type { PivotIndexColum } from '../visualizations/types';
import { type FieldType } from './field';
import { type ResultRow, type ResultValue } from './results';
import {
    ChartType,
    getHiddenTableFields,
    type CreateSavedChartVersion,
    type TableChartConfig,
} from './savedCharts';
import type { GroupByColumn, SortBy, ValuesColumn } from './sqlRunner';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
    hiddenMetricFieldIds?: string[];
    columnTotals?: boolean;
    rowTotals?: boolean;
};

// Used in AsyncQueryService to execute pivoted queries
export type PivotConfiguration = {
    indexColumn: PivotIndexColum | PivotIndexColum[] | undefined;
    valuesColumns: ValuesColumn[];
    groupByColumns: GroupByColumn[] | undefined;
    sortBy: SortBy | undefined;
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

const getTablePivotConfig = (
    tableChartConfig: TableChartConfig,
    pivotConfig: CreateSavedChartVersion['pivotConfig'],
    tableConfig: CreateSavedChartVersion['tableConfig'],
): PivotConfig | undefined =>
    pivotConfig && pivotConfig.columns.length > 0
        ? {
              pivotDimensions: pivotConfig.columns,
              metricsAsRows: tableChartConfig.config?.metricsAsRows ?? false,
              hiddenMetricFieldIds: getHiddenTableFields(tableChartConfig),
              columnOrder: tableConfig.columnOrder,
              rowTotals: tableChartConfig.config?.showRowCalculation ?? false,
              columnTotals:
                  tableChartConfig.config?.showColumnCalculation ?? false,
          }
        : undefined;

const getCartesianPivotConfig = (
    pivotConfig: CreateSavedChartVersion['pivotConfig'],
): PivotConfig | undefined =>
    pivotConfig && pivotConfig.columns.length > 0
        ? {
              pivotDimensions: pivotConfig.columns,
              metricsAsRows: false,
          }
        : undefined;

export const getPivotConfig = (
    savedChart: Pick<
        CreateSavedChartVersion,
        'chartConfig' | 'pivotConfig' | 'tableConfig'
    >,
): PivotConfig | undefined => {
    switch (savedChart.chartConfig.type) {
        case ChartType.TABLE:
            return getTablePivotConfig(
                savedChart.chartConfig,
                savedChart.pivotConfig,
                savedChart.tableConfig,
            );
        case ChartType.CARTESIAN:
            return getCartesianPivotConfig(savedChart.pivotConfig);
        default:
            return undefined;
    }
};
