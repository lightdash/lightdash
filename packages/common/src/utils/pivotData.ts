import type { FieldId } from '../types/field';
import type { ResultRow, ResultValue } from '../types/results';
import type { PivotReference } from '../types/savedCharts';
import { hashFieldReference } from '../types/savedCharts';

export type PivotValueMap = {
    [pivotKey: string]: Record<string, ResultValue>;
};
export type RowKeyMap = Record<string, FieldId | PivotReference>;

export const getPivotedData = (
    rows: ResultRow[],
    pivotKeys: string[],
    keysToPivot: string[],
    keysToNotPivot: string[],
): {
    pivotValuesMap: PivotValueMap;
    rowKeyMap: Record<string, FieldId | PivotReference>;
    rows: ResultRow[];
} => {
    const pivotValuesMap: PivotValueMap = {};
    const rowKeyMap: Record<string, FieldId | PivotReference> = {};
    const pivotedRowMap = rows.reduce<Record<string, ResultRow>>((acc, row) => {
        const unpivotedKeysAndValues: string[] = [];

        const pivotedRow: ResultRow = {};
        Object.entries(row).forEach(([key, value]) => {
            if (keysToPivot.includes(key)) {
                const pivotReference: PivotReference = {
                    field: key,
                    pivotValues: pivotKeys.map((pivotKey) => ({
                        field: pivotKey,
                        value: row[pivotKey]?.value.raw,
                    })),
                };
                const pivotedKeyHash: string =
                    hashFieldReference(pivotReference);
                pivotKeys.forEach((pivotKey) => {
                    if (!pivotValuesMap[pivotKey]) {
                        pivotValuesMap[pivotKey] = {};
                    }

                    pivotValuesMap[pivotKey][`${row[pivotKey]?.value.raw}`] =
                        row[pivotKey]?.value;
                });
                pivotedRow[pivotedKeyHash] = value;
                rowKeyMap[pivotedKeyHash] = pivotReference;
            }
            if (keysToNotPivot.includes(key)) {
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
