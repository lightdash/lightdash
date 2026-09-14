import {
    ContentType,
    getAppDisplayName,
    getChartKind,
    isDashboardChartTileType,
    type AiPromptContextInput,
    type AiPromptContextItem,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useGetApp } from '../../../../features/apps/hooks/useGetApp';
import { useDashboardQuery } from '../../../../hooks/dashboard/useDashboard';
import { useSavedQuery } from '../../../../hooks/useSavedQuery';
import {
    contextItemsToContentMentionSuggestions,
    type ContentMentionSuggestionItem,
} from '../components/ChatElements/contentMentions';

type Args = {
    projectUuid: string | undefined;
    chartUuidOrSlug?: string | null;
    dashboardUuidOrSlug?: string | null;
    dataAppUuidOrSlug?: string | null;
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
 * Resolves a chart, dashboard and/or data app into the two shapes the AI
 * agent thread-creation flow needs:
 *  - `contextInput`: the minimal payload sent to the API.
 *  - `previewItems`: the optimistic, hydrated items rendered in the UI
 *    while the chart/dashboard queries are still resolving.
 */
export const usePinnedContext = ({
    projectUuid,
    chartUuidOrSlug,
    dashboardUuidOrSlug,
    dataAppUuidOrSlug,
}: Args) => {
    const { data: chart } = useSavedQuery({
        uuidOrSlug: chartUuidOrSlug ?? undefined,
        projectUuid,
    });
    const { data: dashboard } = useDashboardQuery({
        uuidOrSlug: dashboardUuidOrSlug ?? undefined,
        projectUuid,
    });
    const { data: appData } = useGetApp(
        projectUuid,
        dataAppUuidOrSlug ?? undefined,
    );
    const dataApp = appData?.pages[0];
    const isReady =
        (!chartUuidOrSlug || !!chart?.uuid) &&
        (!dashboardUuidOrSlug || !!dashboard?.uuid) &&
        (!dataAppUuidOrSlug || !!dataApp?.appUuid);

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
        if (dataApp?.appUuid) {
            items.push({
                type: 'data_app',
                appUuid: dataApp.appUuid,
                appSlug: dataApp.slug,
            });
        }
        return sortPinnedContext(items);
    }, [
        chart?.uuid,
        dashboard?.uuid,
        chart?.slug,
        dashboard?.slug,
        dataApp?.appUuid,
        dataApp?.slug,
    ]);

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
                runtimeOverrides: null,
            });
        }
        if (dataApp?.appUuid) {
            items.push({
                type: 'data_app',
                appUuid: dataApp.appUuid,
                appSlug: dataApp.slug,
                displayName: getAppDisplayName(dataApp.name, dataApp.appUuid),
                pinnedVersion: dataApp.latestReadyVersion,
                isPersonal: dataApp.spaceUuid === null,
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
        dataApp?.appUuid,
        dataApp?.slug,
        dataApp?.name,
        dataApp?.latestReadyVersion,
        dataApp?.spaceUuid,
    ]);

    const contentMentionItems = useMemo<ContentMentionSuggestionItem[]>(() => {
        const dashboardTileItems: ContentMentionSuggestionItem[] =
            dashboard?.tiles
                .filter(isDashboardChartTileType)
                .filter((tile) => !!tile.properties.savedChartUuid)
                .map((tile) => ({
                    id: `dashboardTile:chart:${tile.properties.savedChartUuid}`,
                    label:
                        (!tile.properties.hideTitle && tile.properties.title) ||
                        tile.properties.chartName ||
                        'Chart',
                    contentType: ContentType.CHART,
                    uuid: tile.properties.savedChartUuid!,
                    slug: tile.properties.chartSlug ?? null,
                    chartKind: tile.properties.lastVersionChartKind ?? null,
                    isPersonalDataApp: false,
                    group: 'dashboardTile',
                    dashboardUuid: dashboard.uuid,
                    dashboardSlug: dashboard.slug,
                    dashboardName: dashboard.name,
                    spaceName: dashboard.spaceName,
                    verified: false,
                })) ?? [];

        return [
            ...dashboardTileItems,
            ...contextItemsToContentMentionSuggestions(previewItems, 'current'),
        ];
    }, [dashboard, previewItems]);

    return { contextInput, previewItems, contentMentionItems, isReady };
};
