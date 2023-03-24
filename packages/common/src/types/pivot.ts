import { Dimension, FieldType, Metric } from './field';

type Value = unknown;

type FieldValueType =
    | {
          type: FieldType.DIMENSION;
          fieldId: string;
      }
    | {
          type: FieldType.METRIC;
      };

type ValueType = {
    type: 'value';
};

export interface PivotData {
    headerValueTypes: FieldValueType[];
    headerValues: Value[][];

    columnTypes: Array<FieldValueType | ValueType>;

    rows: Value[][];

    columnTotals?: Value[];
    rowTotals?: Value[];
}
