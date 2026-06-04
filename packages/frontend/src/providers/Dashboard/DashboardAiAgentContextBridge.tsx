import {
    type DashboardChartTile,
    type DashboardFilters,
    type DashboardTile,
    isDashboardChartTileType,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router';
import { scrollToDashboardTile } from '../../components/common/Dashboard/scrollToDashboardTile';
import { useActiveAiAgentThreadStreamParts } from '../../ee/features/aiCopilot/streaming/useAiAgentThreadStreamQuery';
import { getDashboard } from '../../hooks/dashboard/useDashboard';
import { getSavedQuery } from '../../hooks/useSavedQuery';
import { planDashboardAiAgentChanges } from './dashboardAiAgentChangePlanner';
import useDashboardContext from './useDashboardContext';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const isDashboardChartReadyQueryForCharts = (
    queryKey: readonly unknown[],
    savedChartUuids: string[],
    dashboardUuid: string,
) =>
    queryKey[0] === 'dashboard_chart_ready_query' &&
    typeof queryKey[2] === 'string' &&
    savedChartUuids.includes(queryKey[2]) &&
    queryKey[3] === dashboardUuid;

const DashboardAiAgentContextBridge = () => {
    const queryClient = useQueryClient();
    // useDashboardQuery/saved_dashboard_query use UUID-or-slug; useDashboardChartReadyQuery/dashboard_chart_ready_query uses dashboard.uuid.
    const { projectUuid, dashboardUuid: dashboardUuidOrSlug } = useParams<{
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

    const activeThreadParts = useActiveAiAgentThreadStreamParts();

    const handledToolCallIdsRef = useRef<Set<string>>(new Set());
    const pendingChartSlugToFocusRef = useRef<string | null>(null);
    const focusRequestIdRef = useRef(0);

    const currentDashboardSlug = dashboard?.slug;
    const currentDashboardUuid = dashboard?.uuid;
    const dashboardQueryKey = useMemo(
        () => ['saved_dashboard_query', dashboardUuidOrSlug, projectUuid],
        [dashboardUuidOrSlug, projectUuid],
    );

    const scrollToChartTile = useCallback((tile: DashboardChartTile) => {
        const focusRequestId = (focusRequestIdRef.current += 1);

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (focusRequestId !== focusRequestIdRef.current) return;
                scrollToDashboardTile(tile.uuid);
            });
        });
    }, []);

    const refreshChartTilesFromTiles = useCallback(
        async (
            chartSlug: string,
            tiles: DashboardTile[] | undefined,
            options?: { focusTile?: boolean },
        ) => {
            if (!projectUuid || !currentDashboardUuid) return;

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
                    isDashboardChartReadyQueryForCharts(
                        query.queryKey,
                        savedChartUuids,
                        currentDashboardUuid,
                    ),
            });

            if (options?.focusTile) {
                scrollToChartTile(matchingTiles[0]);
            }
        },
        [currentDashboardUuid, projectUuid, queryClient, scrollToChartTile],
    );

    const refreshDashboard = useCallback(
        async (chartSlugToFocus?: string) => {
            if (!projectUuid || !dashboardUuidOrSlug) return false;

            await queryClient.invalidateQueries({
                queryKey: dashboardQueryKey,
                refetchType: 'none',
            });

            const freshDashboard = await queryClient.fetchQuery({
                queryKey: dashboardQueryKey,
                queryFn: () => getDashboard(dashboardUuidOrSlug, projectUuid),
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

            if (chartSlugToFocus) {
                const tileToFocus = chartTiles.find(
                    (tile) => tile.properties.chartSlug === chartSlugToFocus,
                );
                if (tileToFocus) {
                    scrollToChartTile(tileToFocus);
                    return true;
                }
            }

            return false;
        },
        [
            dashboardQueryKey,
            dashboardUuidOrSlug,
            projectUuid,
            queryClient,
            refreshChartTilesFromTiles,
            scrollToChartTile,
            setDashboardFilters,
            setDashboardTabs,
            setDashboardTemporaryFilters,
            setDashboardTiles,
            setOriginalDashboardFilters,
        ],
    );

    const refreshChartTiles = useCallback(
        async (chartSlug: string, options?: { focusTile?: boolean }) =>
            refreshChartTilesFromTiles(chartSlug, dashboardTiles, options),
        [dashboardTiles, refreshChartTilesFromTiles],
    );

    useEffect(() => {
        if (!currentDashboardSlug || !projectUuid || !dashboardUuidOrSlug)
            return;

        const plan = planDashboardAiAgentChanges({
            parts: activeThreadParts,
            handledToolCallIds: handledToolCallIdsRef.current,
            currentDashboardSlug,
            pendingChartSlugToFocus: pendingChartSlugToFocusRef.current,
        });

        for (const toolCallId of plan.handledToolCallIds) {
            handledToolCallIdsRef.current.add(toolCallId);
        }
        pendingChartSlugToFocusRef.current = plan.pendingChartSlugToFocus;

        for (const action of plan.actions) {
            switch (action.type) {
                case 'refreshChart':
                    void refreshChartTiles(action.chartSlug, {
                        focusTile: action.focusTile,
                    });
                    break;
                case 'refreshDashboard':
                    void refreshDashboard(action.focusChartSlug).then(
                        (focused) => {
                            if (
                                focused &&
                                pendingChartSlugToFocusRef.current ===
                                    action.focusChartSlug
                            ) {
                                pendingChartSlugToFocusRef.current = null;
                            }
                        },
                    );
                    break;
            }
        }
    }, [
        activeThreadParts,
        currentDashboardSlug,
        dashboardUuidOrSlug,
        projectUuid,
        refreshChartTiles,
        refreshDashboard,
    ]);

    return null;
};

export default DashboardAiAgentContextBridge;
