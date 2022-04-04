import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    Dimension,
    DimensionType,
    Explore,
    Field,
    fieldId,
    findFieldByIdInExplore,
    formatValue,
    friendlyName,
    getAxisName,
    getDimensions,
    getFieldLabel,
    getFields,
    getFormats,
    getItemId,
    getItemLabel,
    hashFieldReference,
    isField,
    MetricType,
    Series,
    TableCalculation,
} from 'common';
import { useMemo } from 'react';
import { useVisualizationContext } from '../components/LightdashVisualization/VisualizationProvider';
import { getDimensionFormatter } from '../utils/resultFormatter';
import { useOrganisation } from './organisation/useOrganisation';

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

const getAxisTypeFromField = (item?: Field): string => {
    if (item) {
        switch (item.type) {
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
    stack?: string;
    name?: string;
    color?: string;
    yAxisIndex?: number;
    xAxisIndex?: number;
    encode: {
        x: string;
        y: string;
        tooltip: string[];
        seriesName: string;
    };
    dimensions: Array<{ name: string; displayName: string }>;
    emphasis?: {
        focus?: string;
    };
};

const getFormatterValue = (
    value: any,
    key: string,
    fields: Dimension[],
): string => {
    const field = fields.find((item) => fieldId(item) === key);
    const fieldFormatter = field ? getDimensionFormatter(field) : null;
    return fieldFormatter?.({ value: value }) ?? `${value || '∅'}`;
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

const formatter = (format: string, field: string, data: any) => {
    const value: any = data?.value?.[field] || data;
    return formatValue(format, value);
};

export const getEchartsSeries = (
    explore: Explore,
    tableCalculations: TableCalculation[],
    originalData: ApiQueryResults['rows'],
    cartesianChart: CartesianChart,
    pivotKey: string | undefined,
    formats: Record<string, string | undefined> | undefined,
): EChartSeries[] => {
    if (pivotKey) {
        return (cartesianChart.eChartsConfig.series || []).map<EChartSeries>(
            (series) => {
                const { flipAxes } = cartesianChart.layout;
                const xFieldHash = hashFieldReference(series.encode.xRef);
                const yFieldHash = hashFieldReference(series.encode.yRef);
                const pivotField = series.encode.yRef.pivotValues?.find(
                    ({ field }) => field === pivotKey,
                );

                const value = getFormatterValue(
                    pivotField?.value,
                    pivotKey,
                    getDimensions(explore),
                );
                return {
                    ...series,
                    emphasis: {
                        focus: 'series',
                    },
                    xAxisIndex: flipAxes ? series.yAxisIndex : undefined,
                    yAxisIndex: flipAxes ? undefined : series.yAxisIndex,
                    connectNulls: true,
                    encode: {
                        x: flipAxes ? yFieldHash : xFieldHash,
                        y: flipAxes ? xFieldHash : yFieldHash,
                        tooltip:
                            series.type === CartesianSeriesType.BAR
                                ? [yFieldHash]
                                : [xFieldHash, yFieldHash],
                        seriesName: yFieldHash,
                    },
                    dimensions: [
                        {
                            name: xFieldHash,
                            displayName: getLabelFromField(
                                explore,
                                tableCalculations,
                                xFieldHash,
                            ),
                        },
                        {
                            name: yFieldHash,
                            displayName:
                                cartesianChart.layout.yField &&
                                cartesianChart.layout.yField.length > 1
                                    ? `[${value}] ${getLabelFromField(
                                          explore,
                                          tableCalculations,
                                          series.encode.yRef.field,
                                      )}`
                                    : value,
                        },
                    ],
                    tooltip: {
                        valueFormatter: valueFormatter(
                            xFieldHash,
                            series.encode.yRef.field,
                            explore,
                        ),
                    },
                };
            },
        );
    } else {
        return (cartesianChart.eChartsConfig.series || []).reduce<
            EChartSeries[]
        >((sum, series) => {
            const { flipAxes } = cartesianChart.layout;
            const xField = hashFieldReference(series.encode.xRef);
            const yField = hashFieldReference(series.encode.yRef);
            return [
                ...sum,
                {
                    ...series,
                    xAxisIndex: flipAxes ? series.yAxisIndex : undefined,
                    yAxisIndex: flipAxes ? undefined : series.yAxisIndex,
                    emphasis: {
                        focus: 'series',
                    },
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

                    ...(series.label?.show &&
                        formats && {
                            label: {
                                ...series.label,
                                formatter: (value: any) =>
                                    formatter(
                                        formats[yField] || '',
                                        yField,
                                        value,
                                    ),
                            },
                        }),
                },
            ];
        }, []);
    }
};

const getEchartAxis = ({
    items,
    validCartesianConfig,
    series,
    formats,
}: {
    validCartesianConfig: CartesianChart;
    items: Array<Field | TableCalculation>;
    series: EChartSeries[];
    formats: Record<string, string | undefined> | undefined;
}) => {
    const xAxisItem = items.find(
        (item) =>
            getItemId(item) ===
            (validCartesianConfig.layout.flipAxes
                ? validCartesianConfig.layout?.yField?.[0]
                : validCartesianConfig.layout?.xField),
    );
    const yAxisItem = items.find(
        (item) =>
            getItemId(item) ===
            (validCartesianConfig.layout.flipAxes
                ? validCartesianConfig.layout?.xField
                : validCartesianConfig.layout?.yField?.[0]),
    );

    const defaultXAxisType = getAxisTypeFromField(
        isField(xAxisItem) ? xAxisItem : undefined,
    );
    const defaultYAxisType = getAxisTypeFromField(
        isField(yAxisItem) ? yAxisItem : undefined,
    );

    let xAxisType;
    let yAxisType;

    if (validCartesianConfig.layout.flipAxes) {
        xAxisType = defaultXAxisType;
        yAxisType =
            defaultYAxisType === 'value' ? 'category' : defaultYAxisType;
    } else {
        xAxisType =
            defaultXAxisType === 'value' ? 'category' : defaultXAxisType;
        yAxisType = defaultYAxisType;
    }

    const selectedAxisInSeries = Array.from(
        new Set(
            series?.map(({ yAxisIndex, xAxisIndex }) =>
                validCartesianConfig.layout.flipAxes ? xAxisIndex : yAxisIndex,
            ),
        ),
    );
    const isAxisTheSameForAllSeries: boolean =
        selectedAxisInSeries.length === 1;
    const selectedAxisIndex = selectedAxisInSeries[0] || 0;

    const xAxisConfiguration = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig?.yAxis
        : validCartesianConfig.eChartsConfig?.xAxis;
    const yAxisConfiguration = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig?.xAxis
        : validCartesianConfig.eChartsConfig?.yAxis;

    const getAxisFormatter = (
        axisItem: Field | TableCalculation | undefined,
    ) => {
        return (
            axisItem &&
            getItemId(axisItem) &&
            formats?.[getItemId(axisItem)] && {
                axisLabel: {
                    formatter: (value: any) => {
                        const field = getItemId(axisItem);
                        return formatter(formats?.[field] || '', field, value);
                    },
                },
            }
        );
    };

    return {
        xAxis: [
            {
                type: xAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 0,
                          axisReference: 'yRef',
                          axisName: xAxisConfiguration?.[0]?.name,
                          items,
                          series: validCartesianConfig.eChartsConfig.series,
                      })
                    : xAxisConfiguration?.[0]?.name ||
                      (xAxisItem ? getItemLabel(xAxisItem) : undefined),
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
                ...getAxisFormatter(xAxisItem),
            },
            {
                type: xAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 1,
                          axisReference: 'yRef',
                          axisName: xAxisConfiguration?.[1]?.name,
                          items,
                          series: validCartesianConfig.eChartsConfig.series,
                      })
                    : undefined,
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
                splitLine: {
                    show: isAxisTheSameForAllSeries,
                },
            },
        ],
        yAxis: [
            {
                type: yAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[0]?.name ||
                      (yAxisItem ? getItemLabel(yAxisItem) : undefined)
                    : getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 0,
                          axisReference: 'yRef',
                          axisName: yAxisConfiguration?.[0]?.name,
                          items,
                          series: validCartesianConfig.eChartsConfig.series,
                      }),
                nameTextStyle: {
                    fontWeight: 'bold',
                    align: 'left',
                },
                nameLocation: 'end',
                nameGap: 30,
                ...getAxisFormatter(yAxisItem),
            },
            {
                type: yAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[1]?.name
                    : getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 1,
                          axisReference: 'yRef',
                          axisName: yAxisConfiguration?.[1]?.name,
                          items,
                          series: validCartesianConfig.eChartsConfig.series,
                      }),
                nameTextStyle: {
                    fontWeight: 'bold',
                    align: 'right',
                },
                nameLocation: 'end',
                nameGap: 30,
                splitLine: {
                    show: isAxisTheSameForAllSeries,
                },
            },
        ],
    };
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

    const formats = explore ? getFormats(explore) : undefined;
    const { data: organisationData } = useOrganisation();

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
            formats,
        );
    }, [
        explore,
        validCartesianConfig,
        resultsData,
        pivotDimensions,
        originalData,
    ]);

    const items = useMemo(() => {
        if (!explore || !resultsData) {
            return [];
        }
        return [
            ...getFields(explore),
            ...(resultsData?.metricQuery.tableCalculations || []),
        ];
    }, [explore, resultsData]);

    const axis = useMemo(() => {
        if (!validCartesianConfig) {
            return { xAxis: [], yAxis: [] };
        }

        return getEchartAxis({ items, series, validCartesianConfig, formats });
    }, [items, series, validCartesianConfig]);

    if (
        !explore ||
        series.length <= 0 ||
        plotData.length <= 0 ||
        !validCartesianConfig
    ) {
        return undefined;
    }

    return {
        xAxis: axis.xAxis,
        yAxis: axis.yAxis,
        series,
        legend: {
            show: series.length > 1,
        },
        dataset: {
            id: 'lightdashResults',
            source: plotData,
        },
        tooltip: getEchartsTooltipConfig(series[0].type),
        grid: {
            containLabel: true,
            left: '5%', // small padding
            right: '5%', // small padding
            top: 70, // pixels from top (makes room for legend)
            bottom: 30, // pixels from bottom (makes room for x-axis)
        },
        ...(organisationData?.chartColors && {
            color: organisationData?.chartColors,
        }),
    };
};

export default useEcharts;
