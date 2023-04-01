import { FieldType } from './field';

export interface PivotValue {
    raw: unknown;
    formatted: string;
}

export interface PivotMetricValue extends PivotValue {
    fieldId: string;
}

interface PivotFieldValueType {
    type: FieldType;
    fieldId?: string;
}

export interface PivotData {
    headerValueTypes: PivotFieldValueType[];
    headerValues: Array<Array<PivotValue | null>>;

    indexValueTypes: PivotFieldValueType[];
    indexValues: Array<Array<PivotValue | null>>;

    dataColumnCount: number;
    dataValues: Array<Array<PivotMetricValue | null>>;

    columnTotals?: Array<PivotValue | null>;
    rowTotals?: Array<PivotValue | null>;
}
