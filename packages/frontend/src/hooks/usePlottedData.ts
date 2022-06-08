import {
    ApiQueryResults,
    CartesianChart,
    Explore,
    getResultValues,
    hashFieldReference,
    isCompleteLayout,
} from '@lightdash/common';
import { useMemo } from 'react';

export const getPivotedData = (
    rows: { [col: string]: any }[],
    xAxis: string,
    yAxis: string[],
    pivotKey: string,
): { [col: string]: any }[] => {
    const pivoted = rows.reduce((acc, row) => {
        acc[row[xAxis]] = acc[row[xAxis]] || {
            [xAxis]: row[xAxis],
        };
        yAxis.forEach((metricKey) => {
            acc[row[xAxis]][
                hashFieldReference({
                    field: metricKey,
                    pivotValues: [{ field: pivotKey, value: row[pivotKey] }],
                })
            ] = row[metricKey];
        });
        return acc;
    }, {});

    const rowUniqueKeys = [...new Set(rows.map((r) => r[xAxis]))];
    const sortedPivoted = rowUniqueKeys.flatMap((rowKey) => pivoted[rowKey]);

    return Object.values(sortedPivoted);
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
                getResultValues(resultsData.rows, true),
                chartConfig.layout.xField,
                chartConfig.layout.yField,
                pivotDimension,
            );
        }
        return getResultValues(resultsData.rows, true);
    }, [explore, resultsData, chartConfig, pivotDimensions]);
};

export default usePlottedData;
