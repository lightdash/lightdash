import { FieldType } from './field';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
};

export type PivotValue = null | {
    raw: unknown;
    formatted: string;
};

export type PivotFieldValueType =
    | { type: FieldType.METRIC; fieldId?: undefined }
    | {
          type: FieldType.DIMENSION;
          fieldId: string;
      };

export type TitleFieldValue = null | {
    type: FieldType.DIMENSION;
    titleDirection: 'index' | 'header';
    fieldId: string;
};

export interface PivotData {
    headerValueTypes: PivotFieldValueType[];
    headerValues: PivotValue[][];

    indexValueTypes: PivotFieldValueType[];
    indexValues: PivotValue[][];

    dataColumnCount: number;
    dataValues: PivotValue[][];

    columnTotals?: PivotValue[];
    rowTotals?: PivotValue[];
    pivotConfig: PivotConfig;
    titleFields: TitleFieldValue[][];
}
