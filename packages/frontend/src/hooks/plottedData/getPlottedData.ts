import {
    hashFieldReference,
    type ApiQueryResults,
    type FieldId,
    type PivotReference,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';

export type PivotValueMap = {
    [pivotKey: string]: Record<string, ResultValue>;
};
export type RowKeyMap = Record<string, FieldId | PivotReference>;

export const getPivotedData = (
    rows: ApiQueryResults['rows'],
    pivotKeys: string[],
    keysToPivot: string[],
    keysToNotPivot: string[],
): {
    pivotValuesMap: PivotValueMap;
    rowKeyMap: Record<string, FieldId | PivotReference>;
    rows: ApiQueryResults['rows'];
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
                        value: row[pivotKey].value.raw,
                    })),
                };
                const pivotedKeyHash: string =
                    hashFieldReference(pivotReference);
                pivotKeys.forEach((pivotKey) => {
                    if (!pivotValuesMap[pivotKey]) {
                        pivotValuesMap[pivotKey] = {};
                    }

                    pivotValuesMap[pivotKey][`${row[pivotKey].value.raw}`] =
                        row[pivotKey].value;
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

const getPlottedData = (
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

export default getPlottedData;
