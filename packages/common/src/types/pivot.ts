import { FieldType } from './field';

type Value = unknown;

type FieldValueType =
    | {
          type: FieldType.DIMENSION;
          fieldId: string;
      }
    | {
          type: FieldType.METRIC;
      };

export interface PivotData {
    headerValueTypes: FieldValueType[];
    headerValues: Value[][];

    indexValueTypes: FieldValueType[];
    indexValues: Value[][];

    rows: Value[][];

    columnTotals?: Value[];
    rowTotals?: Value[];
}
