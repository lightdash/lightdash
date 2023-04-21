import { FieldType } from './field';
import { ResultValue } from './results';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
    hiddenMetricFieldIds?: string[];
    rowTotals?: boolean;
    columnTotals?: boolean;
};

type HeaderOrIndexType =
    | { type: FieldType.METRIC; fieldId?: undefined }
    | { type: FieldType.DIMENSION; fieldId: string };

export type PivotHeaderType = HeaderOrIndexType;
export type PivotIndexType = HeaderOrIndexType;

export type PivotValue =
    | { type: 'label'; fieldId: string; value?: undefined }
    | { type: 'value'; fieldId: string; value: ResultValue };

export type TotalLabel = {
    titleDirection: 'index' | 'header';
};

export type PivotTitleValue = PivotValue & TotalLabel;

export type TotalTitle = {
    title: string;
} & TotalLabel;

export type PivotData = {
    titleFields: (PivotTitleValue | null)[][];

    headerValueTypes: PivotHeaderType[];
    headerValues: PivotValue[][];

    headerTotals?: (TotalTitle | null)[][];

    indexValueTypes: PivotIndexType[];
    indexValues: PivotValue[][];

    dataColumnCount: number;
    dataValues: (ResultValue | null)[][];

    columnTotals?: (ResultValue | null)[][];
    rowTotals?: (ResultValue | null)[][];

    pivotConfig: PivotConfig;
};
