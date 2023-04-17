import { FieldType } from './field';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
    hiddenMetricFieldIds?: string[];
};

type Value = {
    raw: unknown;
    formatted: string;
};

type HeaderOrIndexType =
    | { type: FieldType.METRIC; fieldId?: undefined }
    | { type: FieldType.DIMENSION; fieldId: string };

export type PivotHeaderType = HeaderOrIndexType;
export type PivotIndexType = HeaderOrIndexType;

export type PivotValue =
    | { type: 'label'; fieldId: string; value?: undefined }
    | { type: 'value'; fieldId: string; value: Value };

export type PivotTitleValue = PivotValue & {
    titleDirection: 'index' | 'header';
};

export type PivotData = {
    titleFields: (PivotTitleValue | null)[][];

    headerValueTypes: PivotHeaderType[];
    headerValues: PivotValue[][];

    indexValueTypes: PivotIndexType[];
    indexValues: PivotValue[][];

    dataColumnCount: number;
    dataValues: (PivotValue | null)[][];

    columnTotals?: (Value | null)[];
    rowTotals?: (Value | null)[];

    pivotConfig: PivotConfig;
};
