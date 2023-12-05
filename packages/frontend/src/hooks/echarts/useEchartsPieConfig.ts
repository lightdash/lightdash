import { formatItemValue, ResultRow, ResultValue } from '@lightdash/common';
import { EChartsOption, PieSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isPieVisualizationConfig } from '../../components/LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

export type PieSeriesDataPoint = NonNullable<
    PieSeriesOption['data']
>[number] & {
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

const useEchartsPieConfig = (isInDashboard: boolean) => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isPieVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const seriesData = useMemo(() => {
        if (!chartConfig) return;

        const {
            groupColorDefaults,
            selectedMetric,
            data,
            sortedGroupLabels,
            validConfig: {
                valueLabel: valueLabelDefault,
                showValue: showValueDefault,
                showPercentage: showPercentageDefault,
                groupLabelOverrides,
                groupColorOverrides,
                groupValueOptionOverrides,
            },
        } = chartConfig;

        if (!selectedMetric) return;

        return data
            .sort(
                ({ name: nameA }, { name: nameB }) =>
                    sortedGroupLabels.indexOf(nameA) -
                    sortedGroupLabels.indexOf(nameB),
            )
            .map(({ name, value, meta }) => {
                const valueLabel =
                    groupValueOptionOverrides?.[name]?.valueLabel ??
                    valueLabelDefault;
                const showValue =
                    groupValueOptionOverrides?.[name]?.showValue ??
                    showValueDefault;
                const showPercentage =
                    groupValueOptionOverrides?.[name]?.showPercentage ??
                    showPercentageDefault;

                const config: PieSeriesDataPoint = {
                    id: name,
                    groupId: name,
                    name: groupLabelOverrides?.[name] ?? name,
                    value: value,
                    itemStyle: {
                        color:
                            groupColorOverrides?.[name] ??
                            groupColorDefaults?.[name],
                    },
                    label: {
                        show: valueLabel !== 'hidden',
                        position:
                            valueLabel === 'outside' ? 'outside' : 'inside',
                        formatter: (params) => {
                            return valueLabel !== 'hidden' &&
                                showValue &&
                                showPercentage
                                ? `${params.percent}% - ${meta.value.formatted}`
                                : showValue
                                ? `${meta.value.formatted}`
                                : showPercentage
                                ? `${params.percent}%`
                                : `${params.name}`;
                        },
                    },
                    meta,
                };

                return config;
            });
    }, [chartConfig]);

    const pieSeriesOption: PieSeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

        const {
            validConfig: {
                isDonut,
                valueLabel: valueLabelDefault,
                showValue: showValueDefault,
                showPercentage: showPercentageDefault,
                showLegend,
                legendPosition,
            },
            selectedMetric,
        } = chartConfig;

        return {
            type: 'pie',
            data: seriesData,
            radius: isDonut ? ['30%', '70%'] : '70%',
            center:
                legendPosition === 'horizontal'
                    ? showLegend &&
                      valueLabelDefault === 'outside' &&
                      (showValueDefault || showPercentageDefault)
                        ? ['50%', '55%']
                        : showLegend
                        ? ['50%', '52%']
                        : ['50%', '50%']
                    : ['50%', '50%'],
            tooltip: {
                trigger: 'item',
                formatter: ({ marker, name, value, percent }) => {
                    const formattedValue = formatItemValue(
                        selectedMetric,
                        value,
                    );

                    return `${marker} <b>${name}</b><br />${percent}% - ${formattedValue}`;
                },
            },
        };
    }, [chartConfig, seriesData]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !pieSeriesOption) return;

        const {
            validConfig: { showLegend, legendPosition },
        } = chartConfig;

        return {
            legend: {
                show: showLegend,
                orient: legendPosition,
                type: 'scroll',
                ...(legendPosition === 'vertical'
                    ? {
                          left: 'left',
                          top: 'middle',
                          align: 'left',
                      }
                    : {
                          left: 'center',
                          top: 'top',
                          align: 'auto',
                      }),
            },
            tooltip: {
                trigger: 'item',
            },
            series: [pieSeriesOption],
            animation: !isInDashboard,
        };
    }, [chartConfig, isInDashboard, pieSeriesOption]);

    if (!itemsMap) return;
    if (!eChartsOption || !pieSeriesOption) return;

    return { eChartsOption, pieSeriesOption };
};

export default useEchartsPieConfig;
