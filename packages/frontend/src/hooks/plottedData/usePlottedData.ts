import {
    ApiQueryResults,
    hashFieldReference,
    ResultRow,
} from '@lightdash/common';
import { useMemo } from 'react';

export const getPivotedData = (
    rows: ApiQueryResults['rows'],
    pivotKey: string,
    pivotedKeys: string[],
    nonPivotedKeys: string[],
): ApiQueryResults['rows'] => {
    const pivotedRowMap = rows.reduce<Record<string, ResultRow>>((acc, row) => {
        const unpivotedKeysAndValues: string[] = [];

        const pivotedRow: ResultRow = {};
        Object.entries(row).forEach(([key, value]) => {
            if (pivotedKeys.includes(key)) {
                const pivotedKeyHash: string = hashFieldReference({
                    field: key,
                    pivotValues: [
                        { field: pivotKey, value: row[pivotKey].value.raw },
                    ],
                });
                pivotedRow[pivotedKeyHash] = value;
            }
            if (nonPivotedKeys.includes(key)) {
                unpivotedKeysAndValues.push(key, `${value.value.raw}`);
                pivotedRow[key] = value;
            }
        });

        const unpivotedHash = unpivotedKeysAndValues.join('.');
        return {
            ...acc,
            [unpivotedHash]: { ...(acc[unpivotedHash] || {}), ...pivotedRow },
        };
    }, {});

    return Object.values(pivotedRowMap);
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
            );
        }
        return rows;
    }, [rows, pivotDimensions, pivotedKeys, nonPivotedKeys]);
};

export default usePlottedData;
