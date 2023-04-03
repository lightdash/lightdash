import { FieldType } from './field';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
};

export interface PivotValue {
    raw: unknown;
    formatted: string;
}

export type PivotFieldValueType =
    | { type: FieldType.METRIC; fieldId?: undefined }
    | { type: FieldType.DIMENSION; fieldId: string };

export type TitleFieldValue = null | {
    type: FieldType.DIMENSION;
    titleDirection: 'index' | 'header';
    fieldId: string;
};

export interface PivotMetricValue extends PivotValue {
    fieldId: string;
}

export interface PivotData {
    titleFields: TitleFieldValue[][];

    headerValueTypes: PivotFieldValueType[];
    headerValues: Array<Array<PivotValue | null>>;

    indexValueTypes: PivotFieldValueType[];
    indexValues: Array<Array<PivotValue | null>>;

    dataColumnCount: number;
    dataValues: Array<Array<PivotMetricValue | null>>;

    columnTotals?: Array<PivotValue | null>;
    rowTotals?: Array<PivotValue | null>;

    pivotConfig: PivotConfig;
}
