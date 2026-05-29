import {
    type DashboardChartTile,
    type DashboardFilters,
    type DashboardTile,
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

    const successfulContentResults = useMemo(
        () =>
            activeThreadParts.flatMap((part) =>
                part.type === 'toolCall' &&
                (part.toolName === 'createContent' ||
                    part.toolName === 'editContent') &&
                part.isPreliminary === false &&
                part.toolResult?.metadata.status === 'success'
                    ? [part]
                    : [],
            ),
        [activeThreadParts],
    );

    const refreshChartTilesFromTiles = useCallback(
        async (chartSlug: string, tiles: DashboardTile[] | undefined) => {
            if (!projectUuid || !dashboardUuid) return;

            const matchingTiles = (tiles ?? []).filter(
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
                    const queryKey = [
                        'saved_query',
                        savedChartUuid,
                        projectUuid,
                    ];
                    await queryClient.invalidateQueries({
                        queryKey,
                        refetchType: 'none',
                    });

                    const freshChart = await queryClient.fetchQuery({
                        queryKey,
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
        [dashboardUuid, projectUuid, queryClient],
    );

    const refreshDashboard = useCallback(async () => {
        if (!projectUuid || !dashboardUuid) return;

        await queryClient.invalidateQueries({
            queryKey: dashboardQueryKey,
            refetchType: 'none',
        });

        const freshDashboard = await queryClient.fetchQuery({
            queryKey: dashboardQueryKey,
            queryFn: () => getDashboard(dashboardUuid, projectUuid),
        });

        const chartTiles = freshDashboard.tiles.filter(
            isDashboardChartTileType,
        );

        setDashboardTiles(freshDashboard.tiles);
        setDashboardTabs(freshDashboard.tabs);
        setDashboardFilters(freshDashboard.filters);
        setOriginalDashboardFilters(freshDashboard.filters);
        setDashboardTemporaryFilters(emptyFilters);

        await Promise.all(
            [
                ...new Set(
                    chartTiles
                        .map((tile) => tile.properties.chartSlug)
                        .filter((slug): slug is string => !!slug),
                ),
            ].map((chartSlug) =>
                refreshChartTilesFromTiles(chartSlug, freshDashboard.tiles),
            ),
        );
    }, [
        dashboardQueryKey,
        dashboardUuid,
        projectUuid,
        queryClient,
        refreshChartTilesFromTiles,
        setDashboardFilters,
        setDashboardTabs,
        setDashboardTemporaryFilters,
        setDashboardTiles,
        setOriginalDashboardFilters,
    ]);

    const refreshChartTiles = useCallback(
        async (chartSlug: string) =>
            refreshChartTilesFromTiles(chartSlug, dashboardTiles),
        [dashboardTiles, refreshChartTilesFromTiles],
    );

    useEffect(() => {
        if (!currentDashboardSlug || !projectUuid || !dashboardUuid) return;

        for (const part of successfulContentResults) {
            const contentSlug =
                part.toolResult?.metadata.status === 'success'
                    ? part.toolResult.metadata.slug
                    : part.toolName === 'createContent'
                      ? part.toolArgs.content.slug
                      : part.toolArgs.slug;
            const targetDashboardSlug =
                part.toolName === 'createContent'
                    ? 'dashboardSlug' in part.toolArgs.content
                        ? part.toolArgs.content.dashboardSlug
                        : undefined
                    : undefined;

            if (handledToolCallIdsRef.current.has(part.toolCallId)) continue;

            handledToolCallIdsRef.current.add(part.toolCallId);

            switch (part.toolArgs.type) {
                case 'chart':
                    if (
                        part.toolName === 'createContent' &&
                        targetDashboardSlug === currentDashboardSlug
                    ) {
                        void refreshDashboard();
                        continue;
                    }

                    void refreshChartTiles(contentSlug);
                    continue;
                case 'dashboard':
                    if (contentSlug !== currentDashboardSlug) continue;
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
        successfulContentResults,
    ]);

    return null;
};

export default DashboardAiAgentContextBridge;
