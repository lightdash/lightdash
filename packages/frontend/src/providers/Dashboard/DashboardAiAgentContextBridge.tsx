import {
    assertUnreachable,
    type DashboardChartTile,
    type DashboardFilters,
    type DashboardSqlChartTile,
    type DashboardTile,
    type DateZoom,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router';
import { scrollToDashboardTile } from '../../components/common/Dashboard/scrollToDashboardTile';
import { setCurrentDashboard } from '../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import {
    addActiveTabToDashboardRuntimeOverrides,
    getDashboardParametersValuesMap,
    getNonDefaultDashboardRuntimeOverrides,
} from '../../ee/features/aiCopilot/store/dashboardPageContext';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../ee/features/aiCopilot/store/hooks';
import { useActiveAiAgentThreadStreamParts } from '../../ee/features/aiCopilot/streaming/useAiAgentThreadStreamQuery';
import { getDashboard } from '../../hooks/dashboard/useDashboard';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { getSavedQuery } from '../../hooks/useSavedQuery';
import { useLightdashApi } from '../LightdashApi/useLightdashApi';
import {
    type DashboardAiAgentChartRef,
    type DashboardAiAgentChartTiles,
    getDashboardTilesForChart,
    planDashboardAiAgentChanges,
} from './dashboardAiAgentChangePlanner';
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

const isSavedSqlChartQueryForCharts = (
    queryKey: readonly unknown[],
    savedSqlUuids: string[],
) =>
    queryKey[0] === 'savedSqlChart' &&
    typeof queryKey[1] === 'string' &&
    savedSqlUuids.includes(queryKey[1]);

const isSameChartRef = (
    a: DashboardAiAgentChartRef | null,
    b: DashboardAiAgentChartRef | null,
) => a?.type === b?.type && a?.slug === b?.slug;

const DashboardAiAgentContextBridge = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    // useDashboardQuery/saved_dashboard_query use UUID-or-slug; useDashboardChartReadyQuery/dashboard_chart_ready_query uses dashboard.uuid.
    const { dashboardUuid: dashboardUuidOrSlug, mode } = useParams();
    const projectUuid = useProjectUuid();
    const isEditMode = mode === 'edit';
    const dispatch = useAiAgentStoreDispatch();
    const dashboardRefreshRequest = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.dashboardRefreshRequest,
    );
    const dashboard = useDashboardContext((c) => c.dashboard);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const originalDashboardFilters = useDashboardContext(
        (c) => c.originalDashboardFilters,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const defaultDateZoomGranularity = useDashboardContext(
        (c) => c.defaultDateZoomGranularity,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
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
    const pendingChartToFocusRef = useRef<DashboardAiAgentChartRef | null>(
        null,
    );
    const focusRequestIdRef = useRef(0);
    const handledRefreshRequestIdRef = useRef(0);

    const currentDashboardSlug = dashboard?.slug;
    const currentDashboardUuid = dashboard?.uuid;
    const defaultParameterValues = useMemo(
        () => getDashboardParametersValuesMap(dashboard?.parameters ?? {}),
        [dashboard?.parameters],
    );
    const defaultDateZoom = useMemo<DateZoom | null>(
        () =>
            defaultDateZoomGranularity && !isDateZoomDisabled
                ? { granularity: defaultDateZoomGranularity }
                : null,
        [defaultDateZoomGranularity, isDateZoomDisabled],
    );
    const effectiveDateZoom = useMemo<DateZoom | null>(
        () =>
            dateZoomGranularity ? { granularity: dateZoomGranularity } : null,
        [dateZoomGranularity],
    );
    const dashboardRuntimeOverrides = useMemo(() => {
        const nonDefaultRuntimeOverrides =
            getNonDefaultDashboardRuntimeOverrides({
                defaultFilters: originalDashboardFilters,
                effectiveFilters: allFilters,
                defaultParameters: defaultParameterValues,
                effectiveParameters: parameterValues,
                defaultDateZoom,
                effectiveDateZoom,
            });
        return addActiveTabToDashboardRuntimeOverrides({
            activeTab,
            runtimeOverrides: nonDefaultRuntimeOverrides,
        });
    }, [
        activeTab,
        allFilters,
        defaultDateZoom,
        defaultParameterValues,
        effectiveDateZoom,
        originalDashboardFilters,
        parameterValues,
    ]);
    const dashboardQueryKey = useMemo(
        () => ['saved_dashboard_query', dashboardUuidOrSlug, projectUuid],
        [dashboardUuidOrSlug, projectUuid],
    );

    const scrollToTile = useCallback((tile: DashboardTile) => {
        const focusRequestId = (focusRequestIdRef.current += 1);

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (focusRequestId !== focusRequestIdRef.current) return;
                scrollToDashboardTile(tile.uuid);
            });
        });
    }, []);

    const refreshSavedChartTiles = useCallback(
        async (tiles: DashboardChartTile[]) => {
            if (!projectUuid || !currentDashboardUuid) return;

            const savedChartUuids = [
                ...new Set(
                    tiles
                        .map((tile) => tile.properties.savedChartUuid)
                        .filter((uuid): uuid is string => !!uuid),
                ),
            ];
            if (savedChartUuids.length === 0) return;

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
                            getSavedQuery(
                                lightdashApi,
                                savedChartUuid,
                                projectUuid,
                            ),
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
        },
        [currentDashboardUuid, lightdashApi, projectUuid, queryClient],
    );

    // Tile results are keyed on the chart's last update, so refetching the chart reruns its results.
    const refreshSqlChartTiles = useCallback(
        async (tiles: DashboardSqlChartTile[]) => {
            const savedSqlUuids = [
                ...new Set(
                    tiles
                        .map((tile) => tile.properties.savedSqlUuid)
                        .filter((uuid): uuid is string => !!uuid),
                ),
            ];
            if (savedSqlUuids.length === 0) return;

            await queryClient.invalidateQueries({
                predicate: (query) =>
                    isSavedSqlChartQueryForCharts(
                        query.queryKey,
                        savedSqlUuids,
                    ),
            });
        },
        [queryClient],
    );

    const refreshTiles = useCallback(
        async (chartTiles: DashboardAiAgentChartTiles) => {
            switch (chartTiles.type) {
                case 'chart':
                    return refreshSavedChartTiles(chartTiles.tiles);
                case 'sql_chart':
                    return refreshSqlChartTiles(chartTiles.tiles);
                default:
                    return assertUnreachable(
                        chartTiles,
                        'Unknown dashboard chart tiles',
                    );
            }
        },
        [refreshSavedChartTiles, refreshSqlChartTiles],
    );

    const refreshChartTilesFromTiles = useCallback(
        async (
            chart: DashboardAiAgentChartRef,
            tiles: DashboardTile[] | undefined,
            options?: { focusTile?: boolean },
        ) => {
            const chartTiles = getDashboardTilesForChart(tiles ?? [], chart);
            if (chartTiles.tiles.length === 0) return;

            await refreshTiles(chartTiles);

            if (options?.focusTile) {
                scrollToTile(chartTiles.tiles[0]);
            }
        },
        [refreshTiles, scrollToTile],
    );

    const refreshDashboard = useCallback(
        async (chartToFocus: DashboardAiAgentChartRef | null) => {
            if (!projectUuid || !dashboardUuidOrSlug) return false;

            await queryClient.invalidateQueries({
                queryKey: dashboardQueryKey,
                refetchType: 'none',
            });

            const freshDashboard = await queryClient.fetchQuery({
                queryKey: dashboardQueryKey,
                queryFn: () =>
                    getDashboard(
                        lightdashApi,
                        dashboardUuidOrSlug,
                        projectUuid,
                    ),
            });

            setDashboardTiles(freshDashboard.tiles);
            setDashboardTabs(freshDashboard.tabs);
            setDashboardFilters(freshDashboard.filters);
            setOriginalDashboardFilters(freshDashboard.filters);
            setDashboardTemporaryFilters(emptyFilters);

            await Promise.all([
                refreshSavedChartTiles(
                    freshDashboard.tiles.filter(isDashboardChartTileType),
                ),
                refreshSqlChartTiles(
                    freshDashboard.tiles.filter(isDashboardSqlChartTile),
                ),
            ]);

            if (chartToFocus) {
                const [tileToFocus] = getDashboardTilesForChart(
                    freshDashboard.tiles,
                    chartToFocus,
                ).tiles;
                if (tileToFocus) {
                    scrollToTile(tileToFocus);
                    return true;
                }
            }

            return false;
        },
        [
            dashboardQueryKey,
            dashboardUuidOrSlug,
            lightdashApi,
            projectUuid,
            queryClient,
            refreshSavedChartTiles,
            refreshSqlChartTiles,
            scrollToTile,
            setDashboardFilters,
            setDashboardTabs,
            setDashboardTemporaryFilters,
            setDashboardTiles,
            setOriginalDashboardFilters,
        ],
    );

    const refreshChartTiles = useCallback(
        async (
            chart: DashboardAiAgentChartRef,
            options?: { focusTile?: boolean },
        ) => refreshChartTilesFromTiles(chart, dashboardTiles, options),
        [dashboardTiles, refreshChartTilesFromTiles],
    );

    useEffect(() => {
        if (!currentDashboardSlug || !projectUuid || !dashboardUuidOrSlug)
            return;

        const plan = planDashboardAiAgentChanges({
            parts: activeThreadParts,
            handledToolCallIds: handledToolCallIdsRef.current,
            currentDashboardSlug,
            pendingChartToFocus: pendingChartToFocusRef.current,
        });

        for (const toolCallId of plan.handledToolCallIds) {
            handledToolCallIdsRef.current.add(toolCallId);
        }
        pendingChartToFocusRef.current = plan.pendingChartToFocus;

        for (const action of plan.actions) {
            switch (action.type) {
                case 'refreshChart':
                    void refreshChartTiles(action.chart, {
                        focusTile: action.focusTile,
                    });
                    break;
                case 'refreshDashboard':
                    void refreshDashboard(action.focusChart).then((focused) => {
                        if (
                            focused &&
                            isSameChartRef(
                                pendingChartToFocusRef.current,
                                action.focusChart,
                            )
                        ) {
                            pendingChartToFocusRef.current = null;
                        }
                    });
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

    useEffect(() => {
        if (!projectUuid || !currentDashboardUuid || !dashboard || isEditMode) {
            dispatch(setCurrentDashboard(null));
            return;
        }
        dispatch(
            setCurrentDashboard({
                projectUuid,
                uuid: currentDashboardUuid,
                name: dashboard.name,
                activeTabUuid: activeTab?.uuid ?? null,
                runtimeOverrides: dashboardRuntimeOverrides,
            }),
        );
    }, [
        dispatch,
        projectUuid,
        currentDashboardUuid,
        dashboard,
        activeTab?.uuid,
        dashboardRuntimeOverrides,
        isEditMode,
    ]);

    useEffect(
        () => () => {
            dispatch(setCurrentDashboard(null));
        },
        [dispatch],
    );

    useEffect(() => {
        if (!dashboardRefreshRequest) return;
        if (
            dashboardRefreshRequest.requestId <=
            handledRefreshRequestIdRef.current
        )
            return;
        if (dashboardRefreshRequest.dashboardUuid !== currentDashboardUuid)
            return;

        handledRefreshRequestIdRef.current = dashboardRefreshRequest.requestId;
        void refreshDashboard(
            dashboardRefreshRequest.focusChartSlug
                ? {
                      type: 'chart',
                      slug: dashboardRefreshRequest.focusChartSlug,
                  }
                : null,
        );
    }, [dashboardRefreshRequest, currentDashboardUuid, refreshDashboard]);

    return null;
};

export default DashboardAiAgentContextBridge;
