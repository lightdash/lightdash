import { FieldType } from './field';

export type PivotValue = null | {
    raw: unknown;
    formatted: string;
};

type PivotFieldValueType = {
    type: FieldType;
    fieldId?: string;
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
}
