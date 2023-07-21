import { formatItemValue } from '@lightdash/common';
import { EChartsOption, PieSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

const useEchartsPieConfig = (): EChartsOption | undefined => {
    const context = useVisualizationContext();
    const {
        pieChartConfig: {
            groupColorDefaults,
            selectedMetric,
            data,
            validPieChartConfig: {
                isDonut,
                valueLabel: valueLabelDefault,
                showValue: showValueDefault,
                showPercentage: showPercentageDefault,
                groupLabelOverrides,
                groupColorOverrides,
                groupValueOptionOverrides,
                groupSortOverrides,
                showLegend,
            },
        },
        explore,
    } = context;

    const seriesData = useMemo(() => {
        if (!selectedMetric) return;

        const sortedData =
            groupSortOverrides && groupSortOverrides.length > 0
                ? data.sort(
                      ([aLabel], [bLabel]) =>
                          groupSortOverrides.indexOf(aLabel) -
                          groupSortOverrides.indexOf(bLabel),
                  )
                : data;

        return sortedData.map(([name, value]) => {
            const valueLabel =
                groupValueOptionOverrides?.[name]?.valueLabel ??
                valueLabelDefault;
            const showValue =
                groupValueOptionOverrides?.[name]?.showValue ??
                showValueDefault;
            const showPercentage =
                groupValueOptionOverrides?.[name]?.showPercentage ??
                showPercentageDefault;

            const config: NonNullable<PieSeriesOption['data']>[number] = {
                name: groupLabelOverrides?.[name] ?? name,
                value,
                itemStyle: {
                    color:
                        groupColorOverrides?.[name] ??
                        groupColorDefaults?.[name],
                },
                label: {
                    show: valueLabel !== 'hidden',
                    position: valueLabel === 'outside' ? 'outside' : 'inside',
                    formatter: (params) => {
                        const formattedValue = formatItemValue(
                            selectedMetric,
                            params.value,
                        );

                        return valueLabel !== 'hidden' &&
                            showValue &&
                            showPercentage
                            ? `${params.percent}% - ${formattedValue}`
                            : showValue
                            ? `${formattedValue}`
                            : showPercentage
                            ? `${params.percent}%`
                            : `${params.name}`;
                    },
                },
            };

            return config;
        });
    }, [
        data,
        groupColorDefaults,
        groupColorOverrides,
        groupLabelOverrides,
        groupValueOptionOverrides,
        groupSortOverrides,
        selectedMetric,
        showPercentageDefault,
        showValueDefault,
        valueLabelDefault,
    ]);

    const eChartsOptions = useMemo(() => {
        const pieSeriesOption: PieSeriesOption = {
            type: 'pie',
            data: seriesData,
            radius: isDonut ? ['30%', '70%'] : '70%',
            center:
                showLegend &&
                valueLabelDefault === 'outside' &&
                (showValueDefault || showPercentageDefault)
                    ? ['50%', '55%']
                    : showLegend
                    ? ['50%', '52%']
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

        const config: EChartsOption = {
            legend: {
                show: showLegend,
                orient: 'horizontal',
                left: 'center',
                type: 'scroll',
            },
            tooltip: {
                trigger: 'item',
            },
            series: [pieSeriesOption],
        };

        return config;
    }, [
        selectedMetric,
        seriesData,
        isDonut,
        valueLabelDefault,
        showValueDefault,
        showPercentageDefault,
        showLegend,
    ]);

    if (!explore || !data || data.length === 0) {
        return undefined;
    }

    return eChartsOptions;
};

export default useEchartsPieConfig;
