import {
    ApiQueryResults,
    CartesianChart,
    Explore,
    hashFieldReference,
    isCompleteLayout,
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
            if (key === pivotKey) {
                return;
            }
            if (pivotedKeys.includes(key)) {
                const pivotedKeyHash: string = hashFieldReference({
                    field: key,
                    pivotValues: [
                        { field: pivotKey, value: row[pivotKey].value.raw },
                    ],
                });
                pivotedRow[pivotedKeyHash] = value;
            } else if (nonPivotedKeys.includes(key)) {
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
    explore: Explore | undefined,
    chartConfig: CartesianChart | undefined,
    resultsData: ApiQueryResults | undefined,
    pivotDimensions: string[] | undefined,
): ApiQueryResults['rows'] => {
    return useMemo(() => {
        if (!explore || !resultsData) {
            return [];
        }
        const pivotDimension = pivotDimensions?.[0];
        if (
            pivotDimension &&
            chartConfig &&
            isCompleteLayout(chartConfig.layout)
        ) {
            return getPivotedData(
                resultsData.rows,
                pivotDimension,
                chartConfig.layout.yField,
                [chartConfig.layout.xField],
            );
        }
        return resultsData.rows;
    }, [explore, resultsData, chartConfig, pivotDimensions]);
};

export default usePlottedData;
