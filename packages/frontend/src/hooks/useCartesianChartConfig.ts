import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    Series,
} from 'common';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PartialCartesianChart = {
    series: Partial<Series>[];
};

export const isValidSeries = (series: Partial<Series>): series is Series =>
    !!series.type && !!series.xField && !!series.yField;

const useCartesianChartConfig = (
    chartConfigs: CartesianChart | undefined,
    resultsData: ApiQueryResults | undefined,
) => {
    const [dirtyConfig, setDirtyConfig] = useState<
        PartialCartesianChart | undefined
    >(chartConfigs);

    useEffect(() => {
        setDirtyConfig(chartConfigs);
    }, [chartConfigs]);

    const setXField = useCallback((xField: string) => {
        setDirtyConfig((prev) => ({
            ...prev,
            series: prev?.series.map((series) => ({ ...series, xField })) || [
                { xField },
            ],
        }));
    }, []);

    const setYFields = useCallback((yFields: string[]) => {
        setDirtyConfig((prev) => {
            const firstSeries = prev?.series[0];
            return {
                ...prev,
                series: yFields.map((yField) => ({ ...firstSeries, yField })),
            };
        });
    }, []);

    const setType = useCallback((type: Series['type'], flipAxes: boolean) => {
        setDirtyConfig((prev) => ({
            ...prev,
            series: prev?.series.map((series) => ({
                ...series,
                type,
                flipAxes,
            })) || [{ type, flipAxes }],
        }));
    }, []);

    const validConfig = useMemo<CartesianChart | undefined>(() => {
        const availableXFields = resultsData
            ? resultsData.metricQuery.dimensions
            : [];
        const availableYFields = resultsData
            ? [
                  ...resultsData.metricQuery.metrics,
                  ...resultsData.metricQuery.tableCalculations.map(
                      ({ name }) => name,
                  ),
              ]
            : [];
        if (availableXFields.length <= 0 || availableYFields.length <= 0) {
            return undefined;
        }
        const validSeries: Series[] =
            dirtyConfig?.series
                .filter(isValidSeries)
                .filter(
                    ({ xField, yField }) =>
                        availableXFields.includes(xField) &&
                        availableYFields.includes(yField),
                ) || [];

        if (validSeries.length <= 0) {
            // reset chart config to valid state
            setDirtyConfig({
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        xField: availableXFields[0],
                        yField: availableYFields[0],
                        flipAxes: false,
                    },
                ],
            });
            return undefined;
        }

        return {
            series: validSeries,
        };
    }, [dirtyConfig, resultsData]);

    return {
        dirtyConfig,
        validConfig,
        setXField,
        setYFields,
        setType,
    };
};

export default useCartesianChartConfig;
