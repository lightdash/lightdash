import { formatItemValue } from '@lightdash/common';
import { useMemo } from 'react';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

const useEchartsPieConfig = () => {
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

    const series = useMemo(() => {
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

            return {
                name: groupLabelOverrides?.[name] ?? name,
                value,
                itemStyle: {
                    color:
                        groupColorOverrides?.[name] ??
                        groupColorDefaults?.[name],
                },
                label: {
                    show: valueLabel !== 'hidden',
                    position: valueLabel === 'hidden' ? 'none' : valueLabel,
                    formatter: (params: {
                        name: string;
                        value: number;
                        percent: number;
                    }) => {
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
                labelLine: {
                    show: valueLabel !== 'hidden',
                },
                tooltip: {
                    formatter: (params: {
                        marker: string;
                        name: string;
                        value: number;
                        percent: number;
                    }) => {
                        const formattedValue = formatItemValue(
                            selectedMetric,
                            params.value,
                        );

                        return `${params.marker} <b>${params.name}</b><br />${params.percent}% - ${formattedValue}`;
                    },
                },
            };
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

    const eChartsOptions = useMemo(
        () => ({
            tooltip: {
                trigger: 'item',
            },
            legend: {
                show: showLegend,
                orient: 'horizontal',
                left: 'center',
                type: 'scroll',
            },
            series: [
                {
                    type: 'pie',
                    radius: isDonut ? ['30%', '70%'] : '70%',
                    center:
                        showLegend &&
                        valueLabelDefault === 'outside' &&
                        (showValueDefault || showPercentageDefault)
                            ? ['50%', '55%']
                            : showLegend
                            ? ['50%', '52%']
                            : ['50%', '50%'],
                    data: series,
                },
            ],
        }),
        [
            series,
            isDonut,
            valueLabelDefault,
            showValueDefault,
            showPercentageDefault,
            showLegend,
        ],
    );

    if (!explore || !data || data.length === 0) {
        return undefined;
    }

    return eChartsOptions;
};

export default useEchartsPieConfig;
