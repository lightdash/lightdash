import {
    isCustomChartTypeSlugChartConfig,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';

export const chartQualityHints = (
    query: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
): string => {
    const chart = query.chartConfig;
    if (
        !chart ||
        isCustomChartTypeSlugChartConfig(chart) ||
        chart.defaultVizType === 'table'
    )
        return '';
    const notes: string[] = [];
    const dimension = chart.xAxisDimension;
    if (chart.defaultVizType === 'pie' && dimension) {
        const slices = new Set(rows.map((row) => row[dimension])).size;
        if (slices > 6)
            notes.push(
                `This pie has ${slices} categories; a bar chart or table will make comparisons easier.`,
            );
    }
    if (chart.groupBy?.length) {
        const groups = chart.groupBy;
        const series = new Set(
            rows.map((row) =>
                JSON.stringify(groups.map((group) => row[group])),
            ),
        ).size;
        if (series > 12)
            notes.push(
                `This chart has ${series} series; consider a table or an explicitly requested narrower grouping.`,
            );
    }
    return notes.length === 0
        ? ''
        : ` Chart readability: ${notes.join(' ')} Do not remove requested categories or change query scope merely to simplify the chart.`;
};
