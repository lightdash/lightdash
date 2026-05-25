import {
    getChartKind,
    type AiPromptContextInput,
    type AiPromptContextItem,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useDashboardQuery } from '../../../../hooks/dashboard/useDashboard';
import { useSavedQuery } from '../../../../hooks/useSavedQuery';

type Args = {
    projectUuid: string | undefined;
    chartUuid?: string | null;
    dashboardUuid?: string | null;
};

const sortPinnedContext = <
    T extends AiPromptContextInput[number] | AiPromptContextItem,
>(
    context: T[],
): T[] =>
    [...context].sort((a, b) => {
        if (a.type === b.type) return 0;
        return a.type === 'dashboard' ? -1 : 1;
    });

/**
 * Resolves a chart and/or dashboard into the two shapes the AI agent
 * thread-creation flow needs:
 *  - `contextInput`: the minimal payload sent to the API.
 *  - `previewItems`: the optimistic, hydrated items rendered in the UI
 *    while the chart/dashboard queries are still resolving.
 */
export const usePinnedContext = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
}: Args) => {
    const { data: chart } = useSavedQuery({
        uuidOrSlug: chartUuid ?? undefined,
        projectUuid,
    });
    const { data: dashboard } = useDashboardQuery({
        uuidOrSlug: dashboardUuid ?? undefined,
        projectUuid,
    });

    const contextInput: AiPromptContextInput = useMemo(() => {
        const items: AiPromptContextInput = [];
        if (chartUuid) {
            items.push({
                type: 'chart',
                chartUuid,
                chartSlug: chart?.slug ?? null,
            });
        }
        if (dashboardUuid) {
            items.push({
                type: 'dashboard',
                dashboardUuid,
                dashboardSlug: dashboard?.slug ?? null,
            });
        }
        return sortPinnedContext(items);
    }, [chartUuid, dashboardUuid, chart?.slug, dashboard?.slug]);

    const previewItems: AiPromptContextItem[] = useMemo(() => {
        const items: AiPromptContextItem[] = [];
        if (chartUuid) {
            items.push({
                type: 'chart',
                chartUuid,
                chartSlug: chart?.slug ?? null,
                displayName: chart?.name ?? null,
                pinnedVersionUuid: null,
                chartKind: chart?.chartConfig
                    ? (getChartKind(
                          chart.chartConfig.type,
                          chart.chartConfig.config,
                      ) ?? null)
                    : null,
                runtimeOverrides: null,
            });
        }
        if (dashboardUuid) {
            items.push({
                type: 'dashboard',
                dashboardUuid,
                dashboardSlug: dashboard?.slug ?? null,
                displayName: dashboard?.name ?? null,
                pinnedVersionUuid: null,
            });
        }
        return sortPinnedContext(items);
    }, [chartUuid, dashboardUuid, chart, dashboard?.name, dashboard?.slug]);

    return { contextInput, previewItems };
};
