import {
    formatItemValue,
    getPivotedData,
    type ApiQueryResults,
    type FieldId,
    type ItemsMap,
    type PivotReference,
    type PivotValueMap,
    type RowKeyMap,
} from '@lightdash/common';
import type { InfiniteQueryResults } from '../useQueryResults';

// Re-export types for backward compatibility
export type { PivotValueMap, RowKeyMap };
// Re-export function for backward compatibility
export { getPivotedData };

export const getPlottedData = (
    rows: ApiQueryResults['rows'] | undefined,
    pivotDimensions: string[] | undefined,
    pivotedKeys: string[] | undefined,
    nonPivotedKeys: string[] | undefined,
): {
    pivotValuesMap: PivotValueMap;
    rowKeyMap: Record<string, FieldId | PivotReference>;
    rows: ApiQueryResults['rows'];
} => {
    if (!rows) {
        return { pivotValuesMap: {}, rowKeyMap: {}, rows: [] };
    }
    if (
        pivotDimensions &&
        pivotDimensions.length > 0 &&
        pivotedKeys &&
        nonPivotedKeys
    ) {
        return getPivotedData(
            rows,
            pivotDimensions,
            pivotedKeys,
            nonPivotedKeys,
        );
    }
    return { pivotValuesMap: {}, rowKeyMap: {}, rows };
};

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
