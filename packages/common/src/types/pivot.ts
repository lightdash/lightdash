import { FieldType } from './field';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
};

export type Value = {
    raw: unknown;
    formatted: string;
};

export type PivotFieldValueType =
    | { type: FieldType.METRIC; fieldId?: undefined }
    | { type: FieldType.DIMENSION; fieldId: string };

export type TitleFieldLabel = {
    fieldId: string;
    type: FieldType.DIMENSION;
    titleDirection: 'index' | 'header';
};

export interface FieldValue extends Value {
    fieldId: string;
}

export type Label =
    | { type: 'label'; fieldId: string; value?: undefined }
    | { type: 'value'; fieldId: string; value: Value };

export interface PivotData {
    titleFields: (TitleFieldLabel | null)[][];

    headerValueTypes: PivotFieldValueType[];
    headerValues: Label[][];

    indexValueTypes: PivotFieldValueType[];
    indexValues: Label[][];

    dataColumnCount: number;
    dataValues: (FieldValue | null)[][];

    columnTotals?: Array<FieldValue | null>;
    rowTotals?: Array<FieldValue | null>;

    pivotConfig: PivotConfig;
}
