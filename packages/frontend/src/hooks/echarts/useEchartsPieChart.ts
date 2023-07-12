import {
    AdditionalMetric,
    formatItemValue,
    Metric,
    PieChartValueOptions,
    TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

const getFormattedLabelOptions = (
    selectedMetric: Metric | AdditionalMetric | TableCalculation,
    { valueLabel, showValue, showPercentage }: Partial<PieChartValueOptions>,
) => {
    const show = valueLabel !== 'hidden' && (showValue || showPercentage);

    const labelConfig = {
        show,
        position: valueLabel,
        formatter: ({ value, percent }: { value: number; percent: number }) => {
            return valueLabel !== 'hidden' && showValue && showPercentage
                ? `${percent}% - ${formatItemValue(selectedMetric, value)}`
                : showValue
                ? formatItemValue(selectedMetric, value)
                : showPercentage
                ? `${percent}%`
                : undefined;
        },
    };

    return {
        label: labelConfig,
        labelLine: { show: show && valueLabel === 'outside' },
        tooltip: { ...labelConfig, position: undefined },
    };
};

const useEchartsPieConfig = () => {
    const context = useVisualizationContext();
    const {
        pieChartConfig: {
            groupColorDefaults,
            selectedMetric,
            data,
            validPieChartConfig: {
                isDonut,
                valueLabel,
                showValue,
                showPercentage,
                groupLabelOverrides,
                groupColorOverrides,
                groupValueOptionOverrides,
                showLegend,
            },
        },
        explore,
    } = context;

    const series = useMemo(() => {
        if (!selectedMetric) return;

        return data.map(([name, value]) => {
            const labelOptions = getFormattedLabelOptions(selectedMetric, {
                valueLabel:
                    groupValueOptionOverrides?.[name]?.valueLabel ?? valueLabel,
                showValue:
                    groupValueOptionOverrides?.[name]?.showValue ?? showValue,
                showPercentage:
                    groupValueOptionOverrides?.[name]?.showPercentage ??
                    showPercentage,
            });

            return {
                name: groupLabelOverrides?.[name] ?? name,
                value,
                itemStyle: {
                    color:
                        groupColorOverrides?.[name] ??
                        groupColorDefaults?.[name],
                },
                ...labelOptions,
            };
        });
    }, [
        data,
        groupColorDefaults,
        groupColorOverrides,
        groupLabelOverrides,
        groupValueOptionOverrides,
        selectedMetric,
        showPercentage,
        showValue,
        valueLabel,
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
                        valueLabel === 'outside' &&
                        (showValue || showPercentage)
                            ? ['50%', '55%']
                            : showLegend
                            ? ['50%', '52%']
                            : ['50%', '50%'],
                    data: series,
                },
            ],
        }),
        [series, isDonut, valueLabel, showValue, showPercentage, showLegend],
    );

    if (!explore || !data || data.length === 0) {
        return undefined;
    }

    return eChartsOptions;
};

export default useEchartsPieConfig;
