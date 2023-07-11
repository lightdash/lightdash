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
            validPieChartConfig: {
                groupFieldIds,
                metricId,
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
        resultsData,
    } = context;

    const data = useMemo(() => {
        if (
            !metricId ||
            !selectedMetric ||
            !resultsData ||
            resultsData.rows.length === 0 ||
            !groupFieldIds ||
            groupFieldIds.length === 0
        ) {
            return [];
        }

        return Object.entries(
            resultsData.rows.reduce<Record<string, number>>((acc, row) => {
                const key = groupFieldIds
                    .map((groupFieldId) => row[groupFieldId].value.formatted)
                    .join(' - ');

                const value = Number(row[metricId].value.raw);

                if (key && value !== undefined) {
                    acc[key] = (acc[key] ?? 0) + (isNaN(value) ? 0 : value);
                }

                return acc;
            }, {}),
        )
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => {
                const labelOptions = getFormattedLabelOptions(selectedMetric, {
                    valueLabel:
                        groupValueOptionOverrides?.[name]?.valueLabel ??
                        valueLabel,
                    showValue:
                        groupValueOptionOverrides?.[name]?.showValue ??
                        showValue,
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
        resultsData,
        groupFieldIds,
        selectedMetric,
        metricId,
        showPercentage,
        showValue,
        valueLabel,
        groupLabelOverrides,
        groupColorOverrides,
        groupValueOptionOverrides,
        groupColorDefaults,
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
                    data,
                },
            ],
        }),
        [data, isDonut, valueLabel, showValue, showPercentage, showLegend],
    );

    if (!explore || !data || data.length === 0) {
        return undefined;
    }

    return eChartsOptions;
};

export default useEchartsPieConfig;
