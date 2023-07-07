import { useMemo } from 'react';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

const useEchartsPieConfig = () => {
    const context = useVisualizationContext();
    const {
        pieChartConfig: {
            groupColorDefaults,
            validPieChartConfig: {
                groupFieldIds,
                metricId,
                isDonut,
                valueLabel,
                showValue,
                showPercentage,
                groupLabelOverrides,
                groupColorOverrides,
                showLegend,
            },
        },
        explore,
        resultsData,
    } = context;

    const data = useMemo(() => {
        if (
            !metricId ||
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
                return {
                    name: groupLabelOverrides?.[name] ?? name,
                    value,
                    itemStyle: {
                        color:
                            groupColorOverrides?.[name] ??
                            groupColorDefaults?.[name],
                    },
                };
            });
    }, [
        groupFieldIds,
        metricId,
        resultsData,
        groupLabelOverrides,
        groupColorOverrides,
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
                        showLegend && valueLabel === 'outside'
                            ? ['50%', '55%']
                            : showLegend
                            ? ['50%', '52%']
                            : ['50%', '50%'],
                    label: {
                        show: valueLabel !== 'hidden',
                        position: valueLabel,
                        formatter:
                            valueLabel !== 'hidden' &&
                            showValue &&
                            showPercentage
                                ? '{d}% - {c}'
                                : showValue
                                ? '{c}'
                                : showPercentage
                                ? '{d}%'
                                : undefined,
                    },
                    data,
                },
            ],
        }),
        [data, isDonut, valueLabel, showLegend, showValue, showPercentage],
    );

    if (!explore || !data || data.length === 0) {
        return undefined;
    }

    return eChartsOptions;
};

export default useEchartsPieConfig;
