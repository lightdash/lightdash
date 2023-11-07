import { CreateSavedChartVersion } from '@lightdash/common';

export const filterFieldsNotVisible = (
    chart: CreateSavedChartVersion,
    columnOrder: string[],
) => {
    const { metricQuery } = chart;
    if (
        chart.chartConfig.type === 'table' &&
        chart.chartConfig.config?.columns &&
        Object.keys(chart.chartConfig.config?.columns).length > 0
    ) {
        const filteredColumnIds = Object.entries(
            chart.chartConfig.config?.columns,
        ).reduce<string[]>((acc, [columnId, columnConfig]) => {
            if (columnConfig.visible === false) return [...acc, columnId];
            return acc;
        }, []);

        const filterFieldNotVisible = (fieldId: string) =>
            !filteredColumnIds?.includes(fieldId);

        return {
            metricQuery: {
                ...metricQuery,
                metrics: metricQuery.metrics.filter(filterFieldNotVisible),
                dimensions: metricQuery.dimensions.filter(
                    filterFieldNotVisible,
                ),
                sorts: metricQuery?.sorts.filter((sort) =>
                    filterFieldNotVisible(sort.fieldId),
                ),
            },
            columnOrder: columnOrder.filter(filterFieldNotVisible),
        };
    }

    return { metricQuery, columnOrder };
};
