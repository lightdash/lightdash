import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    Dimension,
    DimensionType,
    Explore,
    fieldId,
    findFieldByIdInExplore,
    friendlyName,
    getDimensions,
    getFieldLabel,
    MetricType,
    parsePivotedFieldKey,
    Series,
    TableCalculation,
} from 'common';
import { useMemo } from 'react';
import { useVisualizationContext } from '../components/LightdashVisualization/VisualizationProvider';
import { getDimensionFormatter } from '../utils/resultFormatter';

const getLabelFromField = (
    explore: Explore,
    tableCalculations: TableCalculation[],
    key: string | undefined,
) => {
    const field = key ? findFieldByIdInExplore(explore, key) : undefined;
    const tableCalculation = tableCalculations.find(({ name }) => name === key);
    if (field) {
        return getFieldLabel(field);
    } else if (tableCalculation) {
        return tableCalculation.displayName;
    } else if (key) {
        return friendlyName(key);
    } else {
        return '';
    }
};

const getAxisTypeFromField = (
    explore: Explore,
    key: string | undefined,
): string => {
    const field = key ? findFieldByIdInExplore(explore, key) : undefined;
    if (field) {
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
    } else {
        return 'value';
    }
};

const getEchartsTooltipConfig = (type: Series['type']) =>
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
    type: Series['type'];
    connectNulls: boolean;
    name?: string;
    color?: string;
    encode: {
        x: string;
        y: string;
        tooltip: string[];
        seriesName: string;
    };
    dimensions: Array<{ name: string; displayName: string }>;
};

const getFormatterValue = (value: any, key: string, fields: Dimension[]) => {
    const field = fields.find((item) => fieldId(item) === key);
    const fieldFormatter = field ? getDimensionFormatter(field) : null;
    return fieldFormatter?.({ value: value }) ?? `${value}`;
};

const valueFormatter =
    (xField: string, yField: string, explore: Explore) => (rawValue: any) => {
        if (Array.isArray(rawValue)) {
            const xValue = getFormatterValue(
                rawValue[0],
                xField,
                getDimensions(explore),
            );
            const yValue = getFormatterValue(
                rawValue[1],
                yField,
                getDimensions(explore),
            );
            return `${xValue} ${yValue}`;
        }

        return getFormatterValue(rawValue, yField, getDimensions(explore));
    };

export const getEchartsSeries = (
    explore: Explore,
    tableCalculations: TableCalculation[],
    originalData: ApiQueryResults['rows'],
    cartesianChart: CartesianChart,
    pivotKey: string | undefined,
): EChartSeries[] => {
    if (pivotKey) {
        return (cartesianChart.eChartsConfig.series || []).map<EChartSeries>(
            (series) => {
                const { flipAxes } = cartesianChart.layout;
                const xField = series.encode.x;
                const pivotedField = series.encode.y;
                const [yField, rawValue] = parsePivotedFieldKey(pivotedField);

                const value = getFormatterValue(
                    rawValue,
                    pivotKey,
                    getDimensions(explore),
                );
                return {
                    ...series,
                    connectNulls: true,
                    encode: {
                        x: flipAxes ? pivotedField : xField,
                        y: flipAxes ? xField : pivotedField,
                        tooltip:
                            series.type === CartesianSeriesType.BAR
                                ? [pivotedField]
                                : [xField, pivotedField],
                        seriesName: pivotedField,
                    },
                    dimensions: [
                        {
                            name: xField,
                            displayName: getLabelFromField(
                                explore,
                                tableCalculations,
                                xField,
                            ),
                        },
                        {
                            name: pivotedField,
                            displayName:
                                cartesianChart.eChartsConfig.series &&
                                cartesianChart.eChartsConfig.series.length > 1
                                    ? `[${value}] ${getLabelFromField(
                                          explore,
                                          tableCalculations,
                                          yField,
                                      )}`
                                    : value,
                        },
                    ],
                    tooltip: {
                        valueFormatter: valueFormatter(xField, yField, explore),
                    },
                };
            },
        );
    } else {
        return (cartesianChart.eChartsConfig.series || []).reduce<
            EChartSeries[]
        >((sum, series) => {
            const { flipAxes } = cartesianChart.layout;
            const xField = series.encode.x;
            const yField = series.encode.y;
            return [
                ...sum,
                {
                    ...series,
                    connectNulls: true,
                    encode: {
                        ...series.encode,
                        x: flipAxes ? yField : xField,
                        y: flipAxes ? xField : yField,
                        tooltip:
                            series.type === CartesianSeriesType.BAR
                                ? [yField]
                                : [xField, yField],
                        seriesName: yField,
                    },
                    dimensions: [
                        {
                            name: xField,
                            displayName: getLabelFromField(
                                explore,
                                tableCalculations,
                                xField,
                            ),
                        },
                        {
                            name: yField,
                            displayName: getLabelFromField(
                                explore,
                                tableCalculations,
                                yField,
                            ),
                        },
                    ],
                    tooltip: {
                        valueFormatter: valueFormatter(xField, yField, explore),
                    },
                },
            ];
        }, []);
    }
};

const getEchartAxis = (
    layout: CartesianChart['layout'],
    series: Series[],
    explore: Explore,
    xAxisField: string | undefined,
    yAxisField: string | undefined,
) => {
    const defaultXAxisType = getAxisTypeFromField(explore, xAxisField);
    const defaultYAxisType = getAxisTypeFromField(explore, yAxisField);

    let xAxisType = defaultXAxisType;
    let yAxisType = defaultYAxisType;
    if (series[0].type === CartesianSeriesType.BAR) {
        if (layout.flipAxes) {
            xAxisType = defaultXAxisType;
            yAxisType =
                defaultYAxisType === 'value' ? 'category' : defaultYAxisType;
        } else {
            xAxisType =
                defaultXAxisType === 'value' ? 'category' : defaultXAxisType;
            yAxisType = defaultYAxisType;
        }
    }

    return { xAxisType, xAxisField, yAxisType, yAxisField };
};

const useEcharts = () => {
    const {
        cartesianConfig: { validCartesianConfig },
        explore,
        plotData,
        originalData,
        pivotDimensions,
        resultsData,
    } = useVisualizationContext();

    const series = useMemo(() => {
        if (!explore || !validCartesianConfig || !resultsData) {
            return [];
        }

        return getEchartsSeries(
            explore,
            resultsData.metricQuery.tableCalculations,
            originalData,
            validCartesianConfig,
            pivotDimensions?.[0],
        );
    }, [
        explore,
        validCartesianConfig,
        resultsData,
        pivotDimensions,
        originalData,
    ]);

    if (
        !explore ||
        series.length <= 0 ||
        plotData.length <= 0 ||
        !validCartesianConfig
    ) {
        return undefined;
    }

    const [xAxis] = validCartesianConfig.eChartsConfig?.xAxis || [];
    const [yAxis] = validCartesianConfig.eChartsConfig?.yAxis || [];

    const xAxisField = validCartesianConfig.layout?.flipAxes
        ? validCartesianConfig.layout?.yField?.[0]
        : validCartesianConfig.layout?.xField;
    const yAxisField = validCartesianConfig.layout?.flipAxes
        ? validCartesianConfig.layout?.xField
        : validCartesianConfig.layout?.yField?.[0];

    const { xAxisType, yAxisType } = getEchartAxis(
        validCartesianConfig.layout,
        series,
        explore,
        xAxisField,
        yAxisField ? parsePivotedFieldKey(yAxisField)[0] : undefined,
    );

    return {
        xAxis: {
            type: xAxisType,
            name:
                xAxis?.name ||
                getLabelFromField(
                    explore,
                    resultsData?.metricQuery.tableCalculations || [],
                    xAxisField,
                ),
            nameLocation: 'center',
            nameGap: 30,
            nameTextStyle: { fontWeight: 'bold' },
        },
        yAxis: {
            type: yAxisType,
            name:
                yAxis?.name ||
                (series.length === 1
                    ? series[0].name ||
                      getLabelFromField(
                          explore,
                          resultsData?.metricQuery.tableCalculations || [],
                          yAxisField,
                      )
                    : undefined),
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
