import {
    AI_DEEP_RESEARCH_MAX_CHART_DESCRIPTION_CHARS,
    aiDeepResearchChartDefinitionSchema,
    toolRunQueryArgsSchemaPersisted,
    type AiDeepResearchWarehouseChart,
} from '@lightdash/common';

export const resolveDeepResearchWarehouseChart = (
    toolArgs: unknown,
    queryUuid: string,
): { chart: AiDeepResearchWarehouseChart; description: string } | null => {
    // Persisted args may predate the current advertised contract.
    const parsedToolArgs = toolRunQueryArgsSchemaPersisted.safeParse(toolArgs);
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
            funnelDataInput: null,
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
