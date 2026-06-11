import {
    formatItemValue,
    type ApiQueryResults,
    type FieldId,
    type ItemsMap,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import type { InfiniteQueryResults } from '../useQueryResults';

export type PivotValueMap = {
    [pivotKey: string]: Record<string, ResultValue>;
};
export type RowKeyMap = Record<string, FieldId | PivotReference>;

export const getPivotedDataFromPivotDetails = (
    resultsData: InfiniteQueryResults | undefined,
    itemsMap: ItemsMap | undefined,
): {
    pivotValuesMap: PivotValueMap;
    rowKeyMap: RowKeyMap;
    rows: ApiQueryResults['rows'];
} => {
    if (!resultsData) {
        return {
            pivotValuesMap: {},
            rowKeyMap: {},
            rows: [],
        };
    }

    const { pivotDetails, rows } = resultsData;

    if (!pivotDetails) {
        return {
            pivotValuesMap: {},
            rowKeyMap: {},
            rows,
        };
    }

    const pivotValuesMap: PivotValueMap = pivotDetails.valuesColumns.reduce(
        (acc, column) => {
            column.pivotValues.forEach((value) => {
                const field = itemsMap?.[value.referenceField];
                acc[value.referenceField] = {
                    ...acc[value.referenceField],
                    [String(value.value)]: {
                        raw: value.value,
                        formatted: formatItemValue(field, value.value),
                    },
                };
            });
            return acc;
        },
        {} as PivotValueMap,
    );

    const rowKeyMap: RowKeyMap = pivotDetails.valuesColumns.reduce(
        (acc, column) => {
            acc[column.pivotColumnName] = {
                field: column.referenceField,
                pivotValues: column.pivotValues.map((value) => ({
                    field: value.referenceField,
                    value: value.value,
                })),
            };
            return acc;
        },
        {} as RowKeyMap,
    );

    return {
        rows,
        pivotValuesMap,
        rowKeyMap,
    };
};
