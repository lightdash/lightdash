import {
    type DashboardChartTile,
    type DashboardFilters,
    isDashboardChartTileType,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router';
import { useAiAgentStoreSelector } from '../../ee/features/aiCopilot/store/hooks';
import { getDashboard } from '../../hooks/dashboard/useDashboard';
import { getSavedQuery } from '../../hooks/useSavedQuery';
import useDashboardContext from './useDashboardContext';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const DashboardAiAgentContextBridge = () => {
    const queryClient = useQueryClient();
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setOriginalDashboardFilters = useDashboardContext(
        (c) => c.setOriginalDashboardFilters,
    );
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );

    const activeThreadId = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeThreadId,
    );
    const activeThreadParts = useAiAgentStoreSelector((state) =>
        activeThreadId
            ? (state.aiAgentThreadStream[activeThreadId]?.parts ?? [])
            : [],
    );

    const handledToolCallIdsRef = useRef<Set<string>>(new Set());

    const currentDashboardSlug = dashboard?.slug;
    const dashboardQueryKey = useMemo(
        () => ['saved_dashboard_query', dashboardUuid, projectUuid],
        [dashboardUuid, projectUuid],
    );

    const successfulEditContentResults = useMemo(
        () =>
            activeThreadParts.flatMap((part) =>
                part.type === 'toolCall' &&
                part.toolName === 'editContent' &&
                part.isPreliminary === false &&
                part.toolResult?.metadata.status === 'success'
                    ? [part]
                    : [],
            ),
        [activeThreadParts],
    );

    const refreshDashboard = useCallback(async () => {
        if (!projectUuid || !dashboardUuid) return;

        const freshDashboard = await queryClient.fetchQuery({
            queryKey: dashboardQueryKey,
            queryFn: () => getDashboard(dashboardUuid, projectUuid),
        });

        setDashboardTiles(freshDashboard.tiles);
        setDashboardTabs(freshDashboard.tabs);
        setDashboardFilters(freshDashboard.filters);
        setOriginalDashboardFilters(freshDashboard.filters);
        setDashboardTemporaryFilters(emptyFilters);
    }, [
        dashboardQueryKey,
        dashboardUuid,
        projectUuid,
        queryClient,
        setDashboardFilters,
        setDashboardTabs,
        setDashboardTemporaryFilters,
        setDashboardTiles,
        setOriginalDashboardFilters,
    ]);

    const refreshChartTiles = useCallback(
        async (chartSlug: string) => {
            if (!projectUuid || !dashboardUuid) return;

            const matchingTiles = (dashboardTiles ?? []).filter(
                (tile): tile is DashboardChartTile =>
                    isDashboardChartTileType(tile) &&
                    tile.properties.chartSlug === chartSlug &&
                    !!tile.properties.savedChartUuid,
            );

            if (matchingTiles.length === 0) return;

            const savedChartUuids = [
                ...new Set(
                    matchingTiles
                        .map((tile) => tile.properties.savedChartUuid)
                        .filter((uuid): uuid is string => !!uuid),
                ),
            ];

            await Promise.all(
                savedChartUuids.map(async (savedChartUuid) => {
                    const freshChart = await queryClient.fetchQuery({
                        queryKey: ['saved_query', savedChartUuid, projectUuid],
                        queryFn: () =>
                            getSavedQuery(savedChartUuid, projectUuid),
                    });

                    queryClient.setQueryData(
                        ['saved_query', freshChart.slug, projectUuid],
                        freshChart,
                    );
                }),
            );

            await queryClient.resetQueries({
                predicate: (query) =>
                    query.queryKey[0] === 'dashboard_chart_ready_query' &&
                    query.queryKey[2] !== null &&
                    savedChartUuids.includes(query.queryKey[2] as string) &&
                    query.queryKey[3] === dashboardUuid,
            });
        },
        [dashboardTiles, dashboardUuid, projectUuid, queryClient],
    );

    useEffect(() => {
        if (!currentDashboardSlug || !projectUuid || !dashboardUuid) return;

        for (const part of successfulEditContentResults) {
            if (handledToolCallIdsRef.current.has(part.toolCallId)) continue;

            handledToolCallIdsRef.current.add(part.toolCallId);

            switch (part.toolArgs.type) {
                case 'chart':
                    void refreshChartTiles(part.toolArgs.slug);
                    continue;
                case 'dashboard':
                    if (part.toolArgs.slug !== currentDashboardSlug) continue;
                    void refreshDashboard();
                    continue;
            }
        }
    }, [
        currentDashboardSlug,
        dashboardUuid,
        projectUuid,
        refreshChartTiles,
        refreshDashboard,
        successfulEditContentResults,
    ]);

    return null;
};

export default DashboardAiAgentContextBridge;
