import React, { useEffect, useState } from 'react';
import {
    ApiError,
    ApiQueryResults,
    CompiledDimension,
    DimensionType,
    fieldId as getFieldId, fillDates,
    friendlyName,
    getDimensions,
    TableCalculation,
} from 'common';
import { UseQueryResult } from 'react-query';
import { useSavedQuery } from './useSavedQuery';
import { useExplore } from './useExplore';
import { getDimensionFormatter } from './useColumns';
import { useQueryResults } from './useQueryResults';
import { useExplorer } from "../providers/ExplorerProvider";

function getDimensionByKey(dimensions: CompiledDimension[], dimensionKey: string) {
    return dimensions.find(
        (value) => getFieldId(value) === dimensionKey,
    );
}

const getDimensionFormatterByKey = (
    dimensions: CompiledDimension[],
    dimensionKey: string,
) => {
    const dimension = getDimensionByKey(dimensions, dimensionKey);
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
    tableCalculationOptions: TableCalculation[];
    eChartDimensions: { name: string; displayName: string }[];
    series: string[];
    fillMissingGaps: boolean;
    toggleGapFill: () => void;
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
    const [fillMissingGaps, setFillMissingGaps] = useState<boolean>(false);
    const toggleGapFill = () => {
        setFillMissingGaps(!fillMissingGaps);
    }
    const {
        pristineState: { sorts: sortFields },
    } = useExplorer();
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

    /** *
     * Returns a default object to be  used as a placeholder for the missing gaps
     * @param object Non empty object to be used as template for  placeholder base
     * @param baseKey Objects key that fills the gap, won't be replaced with empty value to retain the format of the value(hacky fix for date format not getting lost)
     */
    const getEmptyObject = (object: Object, baseKey: string) => {
        // For now only number is used.
        const typesResetValue = {boolean: 'no', number: 0, string: "", bigint: 0, symbol: undefined, undefined, object: {}, function: undefined};
        return Object.fromEntries(Object.entries(object).map(([k, v]) => {
            if (k !== baseKey) {
                const resetValue = typesResetValue[typeof (v)];
                return [k, resetValue];
            }
                return [k, v]

        }
        ));
    };

    const fillGaps = (rows: any[], gapKey: string, reverse:boolean) => (rows.reduce((accumulator, value, index) => {
        if (index === 0) {
            return [rows[0]];
        }
        const startDateObj = reverse ? value : rows[index - 1];
        const endDateObj = reverse ? rows[index - 1] : value;
        let missingDates = fillDates(startDateObj[gapKey], endDateObj[gapKey], getEmptyObject(rows[0], gapKey), gapKey);
        missingDates.push(endDateObj);
        if (reverse) {
            missingDates = missingDates.reverse();
        }
        return accumulator.concat(missingDates);

    }, []) as []);

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

        if (groupDimension) {
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
                seriesLayout.yMetrics[0],
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
            let {rows} = queryResults.data;
            if (fillMissingGaps) {
                const dimension = getDimensionByKey(dimensions, seriesLayout.xDimension);

                if (dimension) {
                    const sortField = sortFields.find(value => value.fieldId === getFieldId(dimension))
                    if (sortField && dimension.type === DimensionType.DATE) {
                        if (sortField.descending) {
                            rows = fillGaps(rows, seriesLayout.xDimension, true);
                        } else {
                            rows = fillGaps(rows, seriesLayout.xDimension, false);
                        }
                    }
                }
            }
            plotData = rows.map((row) =>
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
            fillMissingGaps,
            toggleGapFill
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
        fillMissingGaps: false,
        toggleGapFill
    };
};
