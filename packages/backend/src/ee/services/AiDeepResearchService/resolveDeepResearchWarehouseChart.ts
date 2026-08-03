import {
    AI_DEEP_RESEARCH_MAX_CHART_DESCRIPTION_CHARS,
    aiDeepResearchChartDefinitionSchema,
    toolRunQueryArgsSchema,
    type AiDeepResearchWarehouseChart,
} from '@lightdash/common';

export const resolveDeepResearchWarehouseChart = (
    toolArgs: unknown,
    queryUuid: string,
): { chart: AiDeepResearchWarehouseChart; description: string } | null => {
    const parsedToolArgs = toolRunQueryArgsSchema.safeParse(toolArgs);
    if (!parsedToolArgs.success || !parsedToolArgs.data.chartConfig) {
        return null;
    }

    const { chartConfig } = parsedToolArgs.data;
    const parsedChart = aiDeepResearchChartDefinitionSchema.safeParse({
        source: 'warehouse',
        queryUuid,
        title: parsedToolArgs.data.title,
        chartConfig: {
            ...chartConfig,
            defaultVizType: chartConfig.groupBy?.length
                ? 'table'
                : chartConfig.defaultVizType,
            groupBy: null,
            funnelDataInput: null,
            stackBars: chartConfig.groupBy?.length
                ? null
                : chartConfig.stackBars,
        },
    });
    if (!parsedChart.success || parsedChart.data.source !== 'warehouse') {
        return null;
    }

    return {
        chart: parsedChart.data,
        description: (
            parsedToolArgs.data.description || parsedChart.data.title
        ).slice(0, AI_DEEP_RESEARCH_MAX_CHART_DESCRIPTION_CHARS),
    };
};
