import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    DimensionType,
    Explore,
    Field,
    findFieldByIdInExplore,
    friendlyName,
    getFieldLabel,
    MetricType,
} from 'common';
import { useMemo } from 'react';
import { useVisualizationContext } from '../components/LightdashVisualization/VisualizationProvider';
import { getPivotedDimension } from './useFormattedAndPlottedData';

const getAxisTypeFromField = (field: Field | undefined): string => {
    if (!field) {
        return 'category';
    }
    switch (field.type) {
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
            return 'value';
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
        case MetricType.DATE:
            return 'time';
        default: {
            return 'category';
        }
    }
};

const getEchartsTooltipConfig = (type: CartesianChart['series'][0]['type']) =>
    type === CartesianSeriesType.BAR
        ? {
              show: true,
              confine: true,
              trigger: 'axis',
              axisPointer: {
                  type: 'shadow',
                  label: { show: true },
              },
          }
        : {
              show: true,
              confine: true,
              trigger: 'item',
          };

export type EChartSeries = {
    type: CartesianChart['series'][0]['type'];
    connectNulls: boolean;
    encode: {
        x: string;
        y: string;
        tooltip: string[];
        seriesName: string;
    };
    dimensions: Array<{ name: string; displayName: string }>;
};

export const getEchartsSeries = (
    explore: Explore,
    formattedData: ApiQueryResults['rows'],
    chartConfig: CartesianChart,
    pivotKey: string | undefined,
): EChartSeries[] => {
    if (pivotKey) {
        const uniquePivotValues = Array.from(
            new Set(formattedData.map((row) => row[pivotKey])),
        );
        return chartConfig.series.reduce<EChartSeries[]>(
            (sum, { yField, xField, type, flipAxes }) => {
                const field = findFieldByIdInExplore(explore, xField);
                const xAxisDimension = {
                    name: xField,
                    displayName: field
                        ? getFieldLabel(field)
                        : friendlyName(xField),
                };
                const groupSeries = uniquePivotValues.map((value) => {
                    const pivotedDimension = getPivotedDimension(value, yField);
                    const pivotField = findFieldByIdInExplore(
                        explore,
                        pivotKey,
                    );
                    const pivotFieldLabel = pivotField
                        ? getFieldLabel(pivotField)
                        : friendlyName(pivotKey);
                    return {
                        type: type,
                        connectNulls: true,
                        encode: {
                            x: flipAxes ? pivotedDimension : xField,
                            y: flipAxes ? xField : pivotedDimension,
                            tooltip:
                                type === CartesianSeriesType.BAR
                                    ? [pivotedDimension]
                                    : [xField, pivotedDimension],
                            seriesName: pivotedDimension,
                        },
                        dimensions: [
                            xAxisDimension,
                            {
                                name: pivotedDimension,
                                displayName:
                                    chartConfig.series.length > 1
                                        ? `[${value}] ${pivotFieldLabel}`
                                        : value,
                            },
                        ],
                    };
                });

                return [...sum, ...groupSeries];
            },
            [],
        );
    } else {
        return chartConfig.series.reduce<EChartSeries[]>(
            (sum, { yField, xField, type, flipAxes }) => {
                const xAxisField = findFieldByIdInExplore(explore, xField);
                const yAxisField = findFieldByIdInExplore(explore, yField);
                return [
                    ...sum,
                    {
                        type: type,
                        connectNulls: true,
                        encode: {
                            x: flipAxes ? yField : xField,
                            y: flipAxes ? xField : yField,
                            tooltip:
                                type === CartesianSeriesType.BAR
                                    ? [yField]
                                    : [xField, yField],
                            seriesName: yField,
                        },
                        dimensions: [
                            {
                                name: xField,
                                displayName: xAxisField
                                    ? getFieldLabel(xAxisField)
                                    : friendlyName(xField),
                            },
                            {
                                name: yField,
                                displayName: yAxisField
                                    ? getFieldLabel(yAxisField)
                                    : friendlyName(yField),
                            },
                        ],
                    },
                ];
            },
            [],
        );
    }
};

const useEcharts = () => {
    const {
        cartesianConfig: { validConfig },
        explore,
        plotData,
        formattedData,
        pivotDimensions,
        resultsData,
    } = useVisualizationContext();

    const series = useMemo(() => {
        if (!explore || !validConfig || !resultsData) {
            return [];
        }

        return getEchartsSeries(
            explore,
            formattedData,
            validConfig,
            pivotDimensions?.[0],
        );
    }, [explore, validConfig, resultsData, pivotDimensions, formattedData]);

    if (!explore || series.length <= 0 || plotData.length <= 0) {
        return undefined;
    }

    const xField = findFieldByIdInExplore(explore, series[0].encode.x);

    const yField = findFieldByIdInExplore(explore, series[0].encode.y);

    let ylabel: string | undefined;
    if (series.length === 1) {
        ylabel = yField
            ? getFieldLabel(yField)
            : friendlyName(series[0].encode.y);
    }

    return {
        xAxis: {
            type: validConfig?.series[0].flipAxes
                ? 'value'
                : getAxisTypeFromField(xField),
            name: xField
                ? getFieldLabel(xField)
                : friendlyName(series[0].encode.x),
            nameLocation: 'center',
            nameGap: 30,
            nameTextStyle: { fontWeight: 'bold' },
        },
        yAxis: {
            type: validConfig?.series[0].flipAxes
                ? getAxisTypeFromField(yField)
                : 'value',
            name: ylabel,
            nameTextStyle: { fontWeight: 'bold', align: 'left' },
            nameLocation: 'end',
        },
        series,
        legend: {
            show: series.length > 1,
        },
        dataset: {
            id: 'lightdashResults',
            source: plotData,
        },
        tooltip: getEchartsTooltipConfig(series[0].type),
    };
};

export default useEcharts;
