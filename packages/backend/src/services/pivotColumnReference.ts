import { type AnyType } from '@lightdash/common';

export const NULL_PIVOT_COLUMN_VALUE_KEY = '__NULL__';

export const getPivotColumnValueKey = (value: AnyType): string =>
    value === null ? NULL_PIVOT_COLUMN_VALUE_KEY : String(value);

export const getPivotColumnValueSuffix = (values: AnyType[]): string =>
    values.map(getPivotColumnValueKey).join('_');
