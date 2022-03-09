import { ApiQueryResults, ChartConfig, Explore } from 'common';
import { useMemo } from 'react';

export const getPivotedDimension = (
    pivotValue: string,
    yAxis: string,
): string => `${pivotValue}_${yAxis}`;

export const getPivotedData = (
    rows: ApiQueryResults['rows'],
    xAxis: string,
    yAxis: string[],
    pivotKey: string,
): ApiQueryResults['rows'] => {
    return Object.values(
        rows.reduce((acc, row) => {
            acc[row[xAxis]] = acc[row[xAxis]] || {
                [xAxis]: row[xAxis],
            };
            yAxis.forEach((metricKey) => {
                acc[row[xAxis]][getPivotedDimension(row[pivotKey], metricKey)] =
                    row[metricKey];
            });
            return acc;
        }, {}),
    );
};

const usePlottedData = (
    explore: Explore | undefined,
    chartConfig: ChartConfig['config'],
    resultsData: ApiQueryResults | undefined,
    pivotDimensions: string[] | undefined,
): ApiQueryResults['rows'] => {
    return useMemo(() => {
        if (!explore || !resultsData || !chartConfig) {
            return [];
        }
        const pivotDimension = pivotDimensions?.[0];
        if (pivotDimension && chartConfig.series.length > 0) {
            return getPivotedData(
                resultsData.rows,
                chartConfig.series[0].xField,
                chartConfig.series.map(({ yField }) => yField),
                pivotDimension,
            );
        }
        return resultsData.rows;
    }, [explore, resultsData, chartConfig, pivotDimensions]);
};

export default usePlottedData;
