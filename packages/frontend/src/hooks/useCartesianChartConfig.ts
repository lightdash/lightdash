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
        if (
            !resultsData ||
            resultsData.metricQuery.dimensions.length <= 0 ||
            resultsData.metricQuery.metrics.length <= 0
        ) {
            return undefined;
        }
        const validSeries: Series[] =
            dirtyConfig?.series
                .filter(isValidSeries)
                .filter(
                    ({ xField, yField }) =>
                        resultsData.metricQuery.dimensions.includes(xField) &&
                        resultsData.metricQuery.metrics.includes(yField),
                ) || [];

        if (validSeries.length <= 0) {
            // reset chart config to valid state
            setDirtyConfig({
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        xField: resultsData.metricQuery.dimensions[0],
                        yField: resultsData.metricQuery.metrics[0],
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
