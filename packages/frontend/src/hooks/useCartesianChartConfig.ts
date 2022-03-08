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

export const isCompleteSeries = (series: Partial<Series>): series is Series =>
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

const getValidSeries = (
    series: Partial<Series>[] | undefined,
    availableFields: string[],
): Series[] =>
    series
        ?.filter(isCompleteSeries)
        .filter(
            ({ xField, yField }) =>
                availableFields.includes(xField) &&
                availableFields.includes(yField),
        ) || [];

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

    const setXField = useCallback((xField: string | undefined) => {
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
            if (prev?.series && prev?.series.length === 1) {
                return {
                    ...prev,
                    series: [{ ...prev.series[0], yField: undefined }],
                };
            }
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

    const [
        availableFields,
        availableDimensions,
        availableMetrics,
        availableTableCalculations,
    ] = useMemo(() => {
        const dimensions = resultsData?.metricQuery.dimensions || [];
        const metrics = resultsData?.metricQuery.metrics || [];
        const tableCalculations =
            resultsData?.metricQuery.tableCalculations.map(
                ({ name }) => name,
            ) || [];
        return [
            [...dimensions, ...metrics, ...tableCalculations],
            dimensions,
            metrics,
            tableCalculations,
        ];
    }, [resultsData]);

    const validConfig = useMemo<CartesianChart | undefined>(() => {
        if (availableFields.length <= 1) {
            return undefined;
        }
        return {
            series: getValidSeries(dirtyConfig?.series, availableFields),
            xAxes: dirtyConfig?.xAxes,
            yAxes: dirtyConfig?.yAxes,
        };
    }, [dirtyConfig, availableFields]);

    useEffect(() => {
        if (availableFields.length > 1) {
            setDirtyConfig((prev) => {
                const validSeries = getValidSeries(
                    prev?.series,
                    availableFields,
                );
                if (validSeries.length > 0) {
                    return { ...prev };
                }

                const defaultChartConfig: PartialCartesianChart = {
                    ...prev,
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            xField:
                                availableDimensions[0] || availableFields[0],
                            yField:
                                [
                                    ...availableMetrics,
                                    ...availableTableCalculations,
                                ][0] || availableFields[1],
                            flipAxes: false,
                            color: getDefaultSeriesColor(0),
                        },
                    ],
                };
                return defaultChartConfig;
            });
        }
    }, [
        availableFields,
        availableDimensions,
        availableMetrics,
        availableTableCalculations,
    ]);

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
