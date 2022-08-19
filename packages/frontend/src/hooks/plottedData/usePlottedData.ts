import {
    ApiQueryResults,
    FieldId,
    hashFieldReference,
    PivotReference,
    ResultRow,
} from '@lightdash/common';
import { useMemo } from 'react';

export const getPivotedData = (
    rows: ApiQueryResults['rows'],
    pivotKey: string,
    pivotedKeys: string[],
    nonPivotedKeys: string[],
): {
    pivotValuesMap: Record<string, ResultRow[0]['value']>;
    rowKeyMap: Record<string, FieldId | PivotReference>;
    rows: ApiQueryResults['rows'];
} => {
    const pivotValuesMap: Record<string, ResultRow[0]['value']> = {};
    const rowKeyMap: Record<string, FieldId | PivotReference> = {};
    const pivotedRowMap = rows.reduce<Record<string, ResultRow>>((acc, row) => {
        const unpivotedKeysAndValues: string[] = [];

        const pivotedRow: ResultRow = {};
        Object.entries(row).forEach(([key, value]) => {
            if (pivotedKeys.includes(key)) {
                const pivotReference: PivotReference = {
                    field: key,
                    pivotValues: [
                        { field: pivotKey, value: row[pivotKey].value.raw },
                    ],
                };
                const pivotedKeyHash: string =
                    hashFieldReference(pivotReference);
                pivotValuesMap[row[pivotKey].value.raw] = row[pivotKey].value;
                pivotedRow[pivotedKeyHash] = value;
                rowKeyMap[pivotedKeyHash] = pivotReference;
            }
            if (nonPivotedKeys.includes(key)) {
                unpivotedKeysAndValues.push(key, `${value.value.raw}`);
                pivotedRow[key] = value;
                rowKeyMap[key] = key;
            }
        });

        const unpivotedHash = unpivotedKeysAndValues.join('.');
        return {
            ...acc,
            [unpivotedHash]: { ...(acc[unpivotedHash] || {}), ...pivotedRow },
        };
    }, {});

    return {
        pivotValuesMap,
        rowKeyMap,
        rows: Object.values(pivotedRowMap),
    };
};

const usePlottedData = (
    rows: ApiQueryResults['rows'] | undefined,
    pivotDimensions: string[] | undefined,
    pivotedKeys: string[] | undefined,
    nonPivotedKeys: string[] | undefined,
): ApiQueryResults['rows'] => {
    return useMemo(() => {
        if (!rows) {
            return [];
        }
        const pivotDimension = pivotDimensions?.[0];
        if (pivotDimension && pivotedKeys && nonPivotedKeys) {
            return getPivotedData(
                rows,
                pivotDimension,
                pivotedKeys,
                nonPivotedKeys,
            ).rows;
        }
        return rows;
    }, [rows, pivotDimensions, pivotedKeys, nonPivotedKeys]);
};

export default usePlottedData;
