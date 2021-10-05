import React, { useEffect, useState } from 'react';
import {
    ApiError,
    ApiQueryResults,
    CompiledDimension,
    fieldId as getFieldId,
    friendlyName,
    getDimensions,
    TableCalculation,
} from 'common';
import { UseQueryResult } from 'react-query';
import { useSavedQuery } from './useSavedQuery';
import { useExplore } from './useExplore';
import { getDimensionFormatter } from './useColumns';
import { useQueryResults } from './useQueryResults';

const getDimensionFormatterByKey = (
    dimensions: CompiledDimension[],
    dimensionKey: string,
) => {
    const dimension = dimensions.find(
        (value) => getFieldId(value) === dimensionKey,
    );
    return dimension ? getDimensionFormatter(dimension) : null;
};
const pivot = (
    values: { [key: string]: any }[],
    dimensions: CompiledDimension[],
    indexKey: string,
    pivotKey: string,
    metricKeys: string[],
) => {
    const indexDimensionFormatter = getDimensionFormatterByKey(
        dimensions,
        indexKey,
    );
    return Object.values(
        values.reduce((acc, value) => {
            acc[value[indexKey]] = acc[value[indexKey]] || {
                [indexKey]:
                    indexDimensionFormatter?.({ value: value[indexKey] }) ??
                    value[indexKey],
            };
            if (metricKeys.length > 1) {
                metricKeys.forEach((metricKey) => {
                    acc[value[indexKey]][`${value[pivotKey]} ${metricKey}`] =
                        value[metricKey];
                });
            } else {
                acc[value[indexKey]][value[pivotKey]] = value[metricKeys[0]];
            }
            return acc;
        }, {}),
    );
};

type ChartConfigBase = {
    setXDimension: (x: string) => void;
    toggleYMetric: (y: string) => void;
    setGroupDimension: (g: string | undefined) => void;
    dimensionOptions: string[];
    metricOptions: string[];
    tableCalculationOptions: TableCalculation[];
    eChartDimensions: { name: string; displayName: string }[];
    series: string[];
};
export type ChartConfig = ChartConfigBase &
    (
        | {
              seriesLayout: ValidSeriesLayout;
              plotData: { [col: string]: any }[];
          }
        | {
              seriesLayout: SeriesLayout;
              plotData: undefined;
          }
    );

type ValidSeriesLayout = {
    xDimension: string;
    yMetrics: string[];
    groupDimension: string | undefined;
};
type SeriesLayout = Partial<ValidSeriesLayout>;

const defaultLayout = (
    queryResults: UseQueryResult<ApiQueryResults, ApiError>,
): SeriesLayout => {
    if (queryResults.data) {
        const xDimension = queryResults.data.metricQuery.dimensions[0];
        const groupDimension =
            queryResults.data.metricQuery.dimensions.length > 1
                ? queryResults.data.metricQuery.dimensions[1]
                : undefined;
        const possibleYMetrics = [
            ...queryResults.data.metricQuery.metrics,
            ...queryResults.data.metricQuery.tableCalculations.map(
                ({ name }) => name,
            ),
        ];
        const yMetrics =
            groupDimension === undefined
                ? possibleYMetrics
                : possibleYMetrics.slice(0, 1);
        return {
            xDimension,
            yMetrics,
            groupDimension,
        } as ValidSeriesLayout;
    }
    return {
        xDimension: undefined,
        yMetrics: undefined,
        groupDimension: undefined,
    };
};

const isValidSeriesLayout = (
    seriesLayout: SeriesLayout,
): seriesLayout is ValidSeriesLayout =>
    !!seriesLayout.xDimension &&
    !!seriesLayout.yMetrics &&
    seriesLayout.yMetrics.length > 0;

export const useChartConfig = (
    savedQueryUuid: string | undefined,
): ChartConfig => {
    const { data } = useSavedQuery({ id: savedQueryUuid });
    const queryResults = useQueryResults();
    const { data: results } = queryResults;
    const [seriesLayout, setSeriesLayout] = useState<SeriesLayout>(
        defaultLayout(queryResults),
    );
    const activeExplore = useExplore();
    const dimensions = activeExplore.data
        ? getDimensions(activeExplore.data)
        : [];
    const dimensionOptions = queryResults.data?.metricQuery.dimensions || [];
    const metricOptions = queryResults.data?.metricQuery.metrics || [];
    const tableCalculationOptions =
        queryResults.data?.metricQuery.tableCalculations || [];

    useEffect(() => {
        if (data?.chartConfig) {
            setSeriesLayout(data?.chartConfig.seriesLayout);
        }
    }, [data]);

    useEffect(() => {
        if (results) {
            const { metricQuery } = results;
            setSeriesLayout((layout) => {
                const xDimension =
                    layout.xDimension &&
                    metricQuery.dimensions.includes(layout.xDimension)
                        ? layout.xDimension
                        : metricQuery.dimensions[0];
                let groupDimension: string | undefined;
                if (metricQuery.dimensions.length > 1) {
                    if (layout.groupDimension !== xDimension) {
                        groupDimension = layout.groupDimension;
                    } else {
                        const [option1, option2] = metricQuery.dimensions;
                        groupDimension =
                            option1 !== xDimension ? option1 : option2;
                    }
                } else {
                    groupDimension = undefined;
                }
                const possibleYMetrics = [
                    ...metricQuery.metrics,
                    ...metricQuery.tableCalculations.map(({ name }) => name),
                ];

                let yMetrics: string[];
                const intersection =
                    layout.yMetrics?.filter((x) =>
                        possibleYMetrics.includes(x),
                    ) || [];
                if (groupDimension === undefined) {
                    yMetrics =
                        intersection.length > 0
                            ? intersection
                            : possibleYMetrics;
                } else {
                    yMetrics =
                        intersection.length > 0
                            ? intersection
                            : possibleYMetrics.slice(0, 1);
                }
                return {
                    xDimension,
                    yMetrics,
                    groupDimension,
                };
            });
        }
    }, [results]);

    const setXDimension = (xDimension: string) => {
        if (queryResults.data)
            setSeriesLayout((layout) => {
                const groupDimension =
                    xDimension === layout.groupDimension
                        ? dimensionOptions.find((d) => d !== xDimension)
                        : layout.groupDimension;
                return { ...layout, xDimension, groupDimension };
            });
    };

    const setGroupDimension = (groupDimension: string | undefined) => {
        if (queryResults.data)
            setSeriesLayout((layout) => {
                const xDimension =
                    groupDimension === layout.xDimension
                        ? dimensionOptions.find((d) => d !== groupDimension)
                        : layout.xDimension;
                return {
                    groupDimension,
                    yMetrics: layout.yMetrics,
                    xDimension,
                };
            });
    };

    const toggleYMetric = (yMetric: string) => {
        if (queryResults.data)
            setSeriesLayout((layout) => {
                if (!layout.yMetrics) return { ...layout, yMetrics: [yMetric] };
                const idx = layout.yMetrics.findIndex((m) => m === yMetric);
                if (idx === -1)
                    return {
                        ...layout,
                        yMetrics: [...layout.yMetrics, yMetric],
                    };
                if (layout.yMetrics.length === 1) return layout;
                return {
                    ...layout,
                    yMetrics: [
                        ...layout.yMetrics.slice(0, idx),
                        ...layout.yMetrics.slice(idx + 1),
                    ],
                };
            });
    };

    if (queryResults.data && isValidSeriesLayout(seriesLayout)) {
        const { groupDimension } = seriesLayout;
        let plotData: any[];
        let series: string[];
        const eChartDimensions: ChartConfig['eChartDimensions'] = [
            {
                name: seriesLayout.xDimension,
                displayName: friendlyName(seriesLayout.xDimension),
            },
        ];

        if (groupDimension && seriesLayout.yMetrics.length > 1) {
            let groupChartDimensions: ChartConfig['eChartDimensions'];
            const dimensionFormatter = getDimensionFormatterByKey(
                dimensions,
                groupDimension,
            );

            [series, groupChartDimensions] = queryResults.data.rows.reduce<
                [string[], ChartConfig['eChartDimensions']]
            >(
                ([prevSeries, prevGroupChartDimensions], r) => {
                    seriesLayout.yMetrics.forEach((metricKey) => {
                        const key = r[groupDimension];
                        const combinedKey = `${key} ${metricKey}`;
                        prevSeries.push(combinedKey);
                        prevGroupChartDimensions.push({
                            name: combinedKey,
                            displayName: dimensionFormatter
                                ? `[${dimensionFormatter({
                                      value: key,
                                  })}] ${friendlyName(metricKey)}`
                                : friendlyName(combinedKey),
                        });
                    });
                    return [[...prevSeries], [...prevGroupChartDimensions]];
                },
                [[], []],
            );

            eChartDimensions.push(...groupChartDimensions);
            plotData = pivot(
                queryResults.data.rows,
                dimensions,
                seriesLayout.xDimension,
                groupDimension,
                seriesLayout.yMetrics,
            );
        } else if (groupDimension) {
            series = Array.from(
                new Set(queryResults.data.rows.map((r) => r[groupDimension])),
            );
            const dimensionFormatter = getDimensionFormatterByKey(
                dimensions,
                groupDimension,
            );
            const groupChartDimensions: ChartConfig['eChartDimensions'] =
                series.map((s) => ({
                    name: s,
                    displayName:
                        dimensionFormatter?.({
                            value: s,
                        }) ?? friendlyName(s),
                }));
            eChartDimensions.push(...groupChartDimensions);
            plotData = pivot(
                queryResults.data.rows,
                dimensions,
                seriesLayout.xDimension,
                groupDimension,
                seriesLayout.yMetrics,
            );
        } else {
            series = seriesLayout.yMetrics;
            const yMetricChartDimensions = series.map((s) => ({
                name: s,
                displayName: friendlyName(s),
            }));
            eChartDimensions.push(...yMetricChartDimensions);
            const dimensionFormatter = getDimensionFormatterByKey(
                dimensions,
                seriesLayout.xDimension,
            );
            plotData = queryResults.data.rows.map((row) =>
                dimensionFormatter
                    ? {
                          ...row,
                          [seriesLayout.xDimension]: dimensionFormatter({
                              value: row[seriesLayout.xDimension],
                          }),
                      }
                    : row,
            );
        }
        return {
            setXDimension,
            setGroupDimension,
            toggleYMetric,
            seriesLayout,
            plotData,
            eChartDimensions,
            metricOptions,
            tableCalculationOptions,
            dimensionOptions,
            series,
        };
    }
    return {
        setXDimension,
        setGroupDimension,
        toggleYMetric,
        seriesLayout,
        plotData: undefined,
        eChartDimensions: [],
        metricOptions,
        tableCalculationOptions,
        dimensionOptions,
        series: [],
    };
};
