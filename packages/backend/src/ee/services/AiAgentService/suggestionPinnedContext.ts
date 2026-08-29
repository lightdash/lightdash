import {
    getItemId,
    type AiChartRuntimeOverrides,
    type AiDashboardRuntimeOverrides,
    type AiPromptContext,
    type AiPromptContextInput,
    type Dashboard,
    type Explore,
    type SavedChart,
} from '@lightdash/common';
import type { SuggestionPinnedContext } from '../ai/agents/suggestionGenerator';

type SuggestionContextMessage =
    | { role: 'user'; context: AiPromptContext }
    | { role: 'assistant' };

type SuggestionChartSource = Pick<
    SavedChart,
    'name' | 'description' | 'chartConfig' | 'metricQuery'
>;

type SuggestionDashboardSource = Pick<
    Dashboard,
    'name' | 'description' | 'tabs'
>;

export const getPinnedSuggestionContextInput = (
    messages: SuggestionContextMessage[] | undefined,
): AiPromptContextInput | undefined => {
    if (!messages) return undefined;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === 'user') {
            const context: AiPromptContextInput = [];
            message.context.forEach((item) => {
                if (item.type === 'chart') {
                    context.push({
                        type: 'chart',
                        chartUuid: item.chartUuid,
                        runtimeOverrides: item.runtimeOverrides ?? undefined,
                    });
                }
                if (item.type === 'dashboard') {
                    context.push({
                        type: 'dashboard',
                        dashboardUuid: item.dashboardUuid,
                        runtimeOverrides: item.runtimeOverrides ?? undefined,
                    });
                }
            });
            if (context.length > 0) return context;
        }
    }

    return undefined;
};

const getChartFields = (
    chart: SuggestionChartSource,
    availableExplores: Explore[],
): SuggestionPinnedContext['fields'] => {
    const explore = availableExplores.find(
        ({ name }) => name === chart.metricQuery.exploreName,
    );
    const fields = new Map<
        string,
        { id: string; label: string; kind: 'dimension' | 'metric' }
    >();

    if (explore) {
        Object.values(explore.tables).forEach((table) => {
            Object.values(table.dimensions).forEach((field) => {
                const id = getItemId(field);
                fields.set(id, {
                    id,
                    label: field.label,
                    kind: 'dimension',
                });
            });
            Object.values(table.metrics).forEach((field) => {
                const id = getItemId(field);
                fields.set(id, { id, label: field.label, kind: 'metric' });
            });
        });
    }

    return [
        ...chart.metricQuery.dimensions.map((id) => ({
            id,
            label: fields.get(id)?.label ?? id,
            kind: 'dimension' as const,
        })),
        ...chart.metricQuery.metrics.map((id) => ({
            id,
            label: fields.get(id)?.label ?? id,
            kind: 'metric' as const,
        })),
    ];
};

export const buildChartSuggestionContext = (
    chart: SuggestionChartSource,
    availableExplores: Explore[],
    runtimeOverrides?: AiChartRuntimeOverrides,
): SuggestionPinnedContext => ({
    type: 'chart',
    name: chart.name,
    description: chart.description ?? null,
    fields: getChartFields(chart, availableExplores),
    metadata: {
        chartType: chart.chartConfig.type,
        exploreName: chart.metricQuery.exploreName,
        runtimeOverrides: runtimeOverrides ?? null,
    },
});

export const buildDashboardSuggestionContext = (
    dashboard: SuggestionDashboardSource,
    charts: SuggestionChartSource[],
    availableExplores: Explore[],
    runtimeOverrides?: AiDashboardRuntimeOverrides,
): SuggestionPinnedContext => {
    const chartContexts = charts.map((chart) =>
        buildChartSuggestionContext(chart, availableExplores),
    );
    const fields = new Map(
        chartContexts.flatMap((chart) =>
            chart.fields.map((field) => [field.id, field] as const),
        ),
    );

    return {
        type: 'dashboard',
        name: dashboard.name,
        description: dashboard.description ?? null,
        fields: [...fields.values()],
        metadata: {
            chartNames: charts.map(({ name }) => name),
            chartTypes: [
                ...new Set(charts.map(({ chartConfig }) => chartConfig.type)),
            ],
            exploreNames: [
                ...new Set(
                    charts.map(({ metricQuery }) => metricQuery.exploreName),
                ),
            ],
            tabNames: dashboard.tabs.map(({ name }) => name),
            runtimeOverrides: runtimeOverrides ?? null,
        },
    };
};
