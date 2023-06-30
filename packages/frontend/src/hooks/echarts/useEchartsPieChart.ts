import { useMemo } from 'react';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

const useEchartsPieConfig = () => {
    const context = useVisualizationContext();
    const {
        pieChartConfig: {
            validPieChartConfig: { groupFieldIds, metricId },
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

                if (key && value) {
                    acc[key] = (acc[key] ?? 0) + (isNaN(value) ? 0 : value);
                }

                return acc;
            }, {}),
        )
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => ({
                name,
                value,
            }));
    }, [groupFieldIds, metricId, resultsData]);

    const eChartsOptions = useMemo(
        () => ({
            tooltip: {
                trigger: 'item',
            },
            legend: {
                orient: 'horizontal',
                left: 'center',
            },

            series: [
                {
                    type: 'pie',
                    label: {
                        show: false,
                        position: 'outside',
                        formatter: '{b}\n {d}%',
                    },
                    data,
                },
            ],
        }),
        [data],
    );

    if (!explore || !data || data.length === 0) {
        return undefined;
    }

    return eChartsOptions;
};

export default useEchartsPieConfig;
