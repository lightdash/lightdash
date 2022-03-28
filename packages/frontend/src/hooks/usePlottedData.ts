import {
    ApiQueryResults,
    ChartConfig,
    Explore,
    isCompleteLayout,
} from 'common';
import { useMemo } from 'react';

export const getPivotedData = (
    rows: ApiQueryResults['rows'],
    xAxis: string,
    yAxis: string[],
    pivotKey: string,
): ApiQueryResults['rows'] => {
    return rows;
    // FIXME return right ResultRow type
    /* return Object.values(
        rows.reduce((acc, row) => {
            acc[row[xAxis]] = acc[row[xAxis]] || {
                [xAxis]: row[xAxis],
            };
            yAxis.forEach((metricKey) => {
                acc[row[xAxis]][
                    hashFieldReference({
                        field: metricKey,
                        pivotValues: [
                            { field: pivotKey, value: row[pivotKey] },
                        ],
                    })
                ] = row[metricKey];
            });
            return acc;
        }, {}),
    );*/
};

const usePlottedData = (
    explore: Explore | undefined,
    chartConfig: ChartConfig['config'],
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
                chartConfig.layout.xField,
                chartConfig.layout.yField,
                pivotDimension,
            );
        }
        return resultsData.rows;
    }, [explore, resultsData, chartConfig, pivotDimensions]);
};

export default usePlottedData;
