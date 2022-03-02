import {
    ApiQueryResults,
    ChartConfig,
    Dimension,
    Explore,
    fieldId,
    getDimensions,
} from 'common';
import { useMemo } from 'react';
import { getDimensionFormatter } from '../utils/resultFormatter';

export const getFormattedData = (
    rows: ApiQueryResults['rows'],
    fields: Dimension[],
): ApiQueryResults['rows'] => {
    return rows.map((row) =>
        Object.entries(row).reduce((sum, [key, value]) => {
            const field = fields.find((item) => fieldId(item) === key);
            const fieldFormatter = field ? getDimensionFormatter(field) : null;
            return {
                ...sum,
                [key]: fieldFormatter?.({ value: value }) ?? value,
            };
        }, {}),
    );
};

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

const useFormattedAndPlottedData = (
    explore: Explore | undefined,
    chartConfig: ChartConfig['config'],
    resultsData: ApiQueryResults | undefined,
    pivotDimensions: string[] | undefined,
): [ApiQueryResults['rows'], ApiQueryResults['rows']] => {
    return useMemo(() => {
        if (!explore || !resultsData || !chartConfig) {
            return [[], []];
        }
        const data = getFormattedData(resultsData.rows, getDimensions(explore));
        const pivotDimension = pivotDimensions?.[0];
        if (pivotDimension && chartConfig.series.length > 0) {
            return [
                data,
                getPivotedData(
                    data,
                    chartConfig.series[0].xField,
                    chartConfig.series.map(({ yField }) => yField),
                    pivotDimension,
                ),
            ];
        }
        return [data, data];
    }, [explore, resultsData, chartConfig, pivotDimensions]);
};

export default useFormattedAndPlottedData;
