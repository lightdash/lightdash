import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    Series,
} from 'common';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PartialCartesianChart = {
    series?: Partial<Series>[];
    xAxes?: CartesianChart['xAxes'];
    yAxes?: CartesianChart['yAxes'];
};

export const isValidSeries = (series: Partial<Series>): series is Series =>
    !!series.type && !!series.xField && !!series.yField;

export const ECHARTS_DEFAULT_COLORS = [
    '#5470c6',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#fc8452',
    '#9a60b4',
    '#ea7ccc',
];

const getDefaultSeriesColor = (index: number) => {
    return ECHARTS_DEFAULT_COLORS[index % ECHARTS_DEFAULT_COLORS.length];
};

const useCartesianChartConfig = (
    chartConfigs: CartesianChart | undefined,
    resultsData: ApiQueryResults | undefined,
) => {
    const [dirtyConfig, setDirtyConfig] = useState<
        PartialCartesianChart | undefined
    >(chartConfigs);
    const xAxisName = (dirtyConfig?.xAxes || [])[0]?.name;
    const yAxisName = (dirtyConfig?.yAxes || [])[0]?.name;

    useEffect(() => {
        setDirtyConfig(chartConfigs);
    }, [chartConfigs]);

    const setXAxisName = useCallback((name: string) => {
        setDirtyConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxes || [];
            return {
                ...prevState,
                xAxes: [{ ...firstAxis, name }, ...axes],
            };
        });
    }, []);

    const setYAxisName = useCallback((name: string) => {
        setDirtyConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.yAxes || [];
            return {
                ...prevState,
                yAxes: [{ ...firstAxis, name }, ...axes],
            };
        });
    }, []);

    const setXField = useCallback((xField: string) => {
        setDirtyConfig((prev) => ({
            ...prev,
            series: prev?.series?.map((series) => ({ ...series, xField })) || [
                { xField },
            ],
        }));
    }, []);

    const addSingleSeries = useCallback((newSeries: Partial<Series>) => {
        setDirtyConfig((prev) => {
            const [{ name, yField, color, ...rest }] = prev?.series || [];
            const currentSeries = prev?.series || [];
            return {
                ...prev,
                series: [
                    ...currentSeries,
                    {
                        color: getDefaultSeriesColor(currentSeries.length),
                        ...rest,
                        ...newSeries,
                    },
                ],
            };
        });
    }, []);

    const updateSingleSeries = useCallback(
        (index: number, updatedSeries: Partial<Series>) => {
            setDirtyConfig((prev) => {
                const [{ name, yField, color, ...rest }] = prev?.series || [];
                return {
                    ...prev,
                    series: prev?.series
                        ? [
                              ...prev.series.slice(0, index),
                              { ...rest, ...updatedSeries },
                              ...prev.series.slice(index + 1),
                          ]
                        : [],
                };
            });
        },
        [],
    );

    const removeSingleSeries = useCallback((index: number) => {
        setDirtyConfig((prev) => {
            return {
                ...prev,
                series: prev?.series
                    ? [
                          ...prev.series.slice(0, index),
                          ...prev.series.slice(index + 1),
                      ]
                    : [],
            };
        });
    }, []);

    const setType = useCallback((type: Series['type'], flipAxes: boolean) => {
        setDirtyConfig((prev) => ({
            ...prev,
            series: prev?.series?.map((series) => ({
                ...series,
                type,
                flipAxes,
            })) || [{ type, flipAxes }],
        }));
    }, []);

    const setLabel = useCallback((label: Series['label']) => {
        setDirtyConfig(
            (prevState) =>
                prevState && {
                    ...prevState,
                    series: prevState?.series?.map((series) => ({
                        ...series,
                        label: {
                            show:
                                label?.show !== undefined
                                    ? label?.show
                                    : series.label?.show,
                            position:
                                label?.position !== undefined
                                    ? label?.position
                                    : series.label?.position,
                        },
                    })),
                },
        );
    }, []);

    const validConfig = useMemo<CartesianChart | undefined>(() => {
        const availableDimensions = resultsData
            ? resultsData.metricQuery.dimensions
            : [];
        const availableMetricsAndTableCalculations = resultsData
            ? [
                  ...resultsData.metricQuery.metrics,
                  ...resultsData.metricQuery.tableCalculations.map(
                      ({ name }) => name,
                  ),
              ]
            : [];
        const availableFields = [
            ...availableDimensions,
            ...availableMetricsAndTableCalculations,
        ];
        if (availableFields.length <= 1) {
            return undefined;
        }
        const validSeries: Series[] =
            dirtyConfig?.series
                ?.filter(isValidSeries)
                .filter(
                    ({ xField, yField }) =>
                        availableFields.includes(xField) &&
                        availableFields.includes(yField),
                ) || [];

        if (validSeries.length <= 0) {
            // reset chart config to valid state
            setDirtyConfig({
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        xField: availableDimensions[0] || availableFields[0],
                        yField:
                            availableMetricsAndTableCalculations[0] ||
                            availableFields[1],
                        flipAxes: false,
                        color: getDefaultSeriesColor(0),
                    },
                ],
            });
            return undefined;
        }

        return {
            series: validSeries,
            xAxes: dirtyConfig?.xAxes,
            yAxes: dirtyConfig?.yAxes,
        };
    }, [dirtyConfig, resultsData]);

    return {
        dirtyConfig,
        validConfig,
        setXField,
        setType,
        setXAxisName,
        setYAxisName,
        xAxisName,
        yAxisName,
        setLabel,
        addSingleSeries,
        updateSingleSeries,
        removeSingleSeries,
    };
};

export default useCartesianChartConfig;
