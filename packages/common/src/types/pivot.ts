import { type FieldType } from './field';
import { type ResultRow, type ResultValue } from './results';
import {
    ChartType,
    getHiddenTableFields,
    type CreateSavedChartVersion,
} from './savedCharts';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
    hiddenMetricFieldIds?: string[];
    summableMetricFieldIds?: string[];
    columnTotals?: boolean;
    rowTotals?: boolean;
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

export const getPivotConfig = (
    savedChart: CreateSavedChartVersion,
): PivotConfig | undefined =>
    savedChart.chartConfig.type === ChartType.TABLE &&
    savedChart.pivotConfig !== undefined
        ? {
              pivotDimensions: savedChart.pivotConfig.columns,
              metricsAsRows:
                  savedChart.chartConfig.config?.metricsAsRows ?? false,
              hiddenMetricFieldIds: getHiddenTableFields(
                  savedChart.chartConfig,
              ),
              columnOrder: savedChart.tableConfig.columnOrder,
          }
        : undefined;
