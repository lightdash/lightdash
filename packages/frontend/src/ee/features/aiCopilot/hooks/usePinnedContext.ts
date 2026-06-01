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
    chartUuidOrSlug?: string | null;
    dashboardUuidOrSlug?: string | null;
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
    chartUuidOrSlug,
    dashboardUuidOrSlug,
}: Args) => {
    const { data: chart } = useSavedQuery({
        uuidOrSlug: chartUuidOrSlug ?? undefined,
        projectUuid,
    });
    const { data: dashboard } = useDashboardQuery({
        uuidOrSlug: dashboardUuidOrSlug ?? undefined,
        projectUuid,
    });
    const isReady =
        (!chartUuidOrSlug || !!chart?.uuid) &&
        (!dashboardUuidOrSlug || !!dashboard?.uuid);

    const contextInput: AiPromptContextInput = useMemo(() => {
        const items: AiPromptContextInput = [];
        if (chart?.uuid) {
            items.push({
                type: 'chart',
                chartUuid: chart.uuid,
                chartSlug: chart?.slug ?? null,
            });
        }
        if (dashboard?.uuid) {
            items.push({
                type: 'dashboard',
                dashboardUuid: dashboard.uuid,
                dashboardSlug: dashboard?.slug ?? null,
            });
        }
        return sortPinnedContext(items);
    }, [chart?.uuid, dashboard?.uuid, chart?.slug, dashboard?.slug]);

    const chartKind = useMemo(
        () =>
            chart?.chartConfig
                ? (getChartKind(
                      chart.chartConfig.type,
                      chart.chartConfig.config,
                  ) ?? null)
                : null,
        [chart?.chartConfig],
    );

    const previewItems: AiPromptContextItem[] = useMemo(() => {
        const items: AiPromptContextItem[] = [];
        if (chart?.uuid) {
            items.push({
                type: 'chart',
                chartUuid: chart.uuid,
                chartSlug: chart?.slug ?? null,
                displayName: chart?.name ?? null,
                pinnedVersionUuid: null,
                chartKind,
                runtimeOverrides: null,
            });
        }
        if (dashboard?.uuid) {
            items.push({
                type: 'dashboard',
                dashboardUuid: dashboard.uuid,
                dashboardSlug: dashboard?.slug ?? null,
                displayName: dashboard?.name ?? null,
                pinnedVersionUuid: null,
            });
        }
        return sortPinnedContext(items);
    }, [
        chart?.uuid,
        chart?.slug,
        chart?.name,
        chartKind,
        dashboard?.uuid,
        dashboard?.name,
        dashboard?.slug,
    ]);

    return { contextInput, previewItems, isReady };
};
