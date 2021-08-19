import React, { useEffect, useState } from 'react';
import {
    ApiError,
    ApiQueryResults,
    CompiledDimension,
    fieldId as getFieldId,
    friendlyName,
    getDimensions,
} from 'common';
import { UseQueryResult } from 'react-query';
import { useSavedQuery } from './useSavedQuery';
import { useTable } from './useTable';
import { getDimensionFormatter } from './useColumns';

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
    metricKey: string,
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
            acc[value[indexKey]][value[pivotKey]] = value[metricKey];
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
        const yMetrics =
            groupDimension === undefined
                ? queryResults.data.metricQuery.metrics
                : queryResults.data.metricQuery.metrics.slice(0, 1);
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
    queryResults: UseQueryResult<ApiQueryResults, ApiError>,
): ChartConfig => {
    const { data } = useSavedQuery({ id: savedQueryUuid });
    const [seriesLayout, setSeriesLayout] = useState<SeriesLayout>(
        defaultLayout(queryResults),
    );
    const activeExplore = useTable();
    const dimensions = activeExplore.data
        ? getDimensions(activeExplore.data)
        : [];
    const dimensionOptions = queryResults.data?.metricQuery.dimensions || [];
    const metricOptions = queryResults.data?.metricQuery.metrics || [];

    useEffect(() => {
        if (data?.chartConfig) {
            setSeriesLayout(data?.chartConfig.seriesLayout);
        }
    }, [data]);

    useEffect(() => {
        if (queryResults.data) {
            setSeriesLayout(defaultLayout(queryResults));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryResults.data]);

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
                const yMetrics =
                    groupDimension &&
                    layout.yMetrics &&
                    layout.yMetrics.length > 1
                        ? [layout.yMetrics[0]]
                        : layout.yMetrics;
                const xDimension =
                    groupDimension === layout.xDimension
                        ? dimensionOptions.find((d) => d !== groupDimension)
                        : layout.xDimension;
                return { groupDimension, yMetrics, xDimension };
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
        const plotData = seriesLayout.groupDimension
            ? pivot(
                  queryResults.data.rows,
                  dimensions,
                  seriesLayout.xDimension,
                  seriesLayout.groupDimension,
                  seriesLayout.yMetrics[0],
              )
            : queryResults.data.rows;
        const { groupDimension } = seriesLayout;
        let series: string[];
        const eChartDimensions: ChartConfig['eChartDimensions'] = [
            {
                name: seriesLayout.xDimension,
                displayName: friendlyName(seriesLayout.xDimension),
            },
        ];
        // add more chart dimensions
        if (groupDimension) {
            series = Array.from(
                new Set(queryResults.data.rows.map((r) => r[groupDimension])),
            );
            const dimensionFormatter = getDimensionFormatterByKey(
                dimensions,
                groupDimension,
            );
            // Convert to dictionary to get unique set.
            const groupChartDimensions: {
                name: string;
                displayName: string;
            }[] = series.map((s) => ({
                name: s,
                displayName:
                    dimensionFormatter?.({
                        value: s,
                    }) ?? friendlyName(s),
            }));
            eChartDimensions.push(...groupChartDimensions);
        } else {
            series = seriesLayout.yMetrics;
            const yMetricChartDimensions = series.map((s) => ({
                name: s,
                displayName: friendlyName(s),
            }));
            eChartDimensions.push(...yMetricChartDimensions);
        }
        return {
            setXDimension,
            setGroupDimension,
            toggleYMetric,
            seriesLayout,
            plotData,
            eChartDimensions,
            metricOptions,
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
        dimensionOptions,
        series: [],
    };
};
