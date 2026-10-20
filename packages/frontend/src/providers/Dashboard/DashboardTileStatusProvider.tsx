import {
    isDashboardChartTileType,
    isDashboardDataAppTileType,
    isDashboardSqlChartTile,
    isTileInPagedExport,
    isTileInSelectedTabs,
    type CacheMetadata,
    type Dashboard,
} from '@lightdash/common';
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
} from 'react';
import { useLocation } from 'react-router';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    dashboardTileStatusActions,
    selectCompletedEmbedTiles,
    selectDateZoomGranularity,
    selectParameterValues,
    selectRefreshCounter,
    useDashboardAllFilters,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../features/dashboard/store';
import {
    auditResponseToTileStatuses,
    useDashboardPreAggregateAudit,
} from '../../hooks/dashboard/useDashboardPreAggregateAudit';
import useSearchParams from '../../hooks/useSearchParams';
import useApp from '../App/useApp';
import DashboardTileStatusContext from './tileStatusContext';
import {
    type SqlChartTileMetadata,
    type TilePreAggregateStatus,
} from './types';
import useDashboardContext from './useDashboardContext';

export type DashboardTileStatusProviderProps = {
    dashboardTiles: Dashboard['tiles'] | undefined;
    dashboardTabs: Dashboard['tabs'];
    activeTab: Dashboard['tabs'][number] | undefined;
    schedulerTabsSelected?: (string | null)[] | undefined;
    children: React.ReactNode;
};

const DashboardTileStatusProvider: React.FC<
    DashboardTileStatusProviderProps
> = ({
    dashboardTiles,
    dashboardTabs,
    activeTab,
    schedulerTabsSelected,
    children,
}) => {
    const exportPagedTabs = useSearchParams('exportPagedTabs') === 'true';
    // Tile reports go to the store, so they don't re-render this provider and
    // every tile-status consumer with it.
    const dispatch = useDashboardDispatch();

    const setIsAutoRefresh = useCallback(
        (autoRefresh: boolean) => {
            dispatch(dashboardTileStatusActions.setIsAutoRefresh(autoRefresh));
        },
        [dispatch],
    );

    // Track which tiles have loaded (to know when all are complete)
    const markTileLoaded = useCallback(
        (tileUuid: string) => {
            dispatch(dashboardTileStatusActions.markTileLoaded(tileUuid));
        },
        [dispatch],
    );

    // The chart tiles that must load before all charts count as loaded
    // Tiles without a tab render on the first tab only (see dashboardTabs and
    // MinimalDashboard), so they count there and nowhere else
    const isTileOnActiveTab = useCallback(
        (tile: Dashboard['tiles'][number]) => {
            if (!activeTab) return true;
            return tile.tabUuid
                ? tile.tabUuid === activeTab.uuid
                : activeTab.uuid === dashboardTabs[0]?.uuid;
        },
        [activeTab, dashboardTabs],
    );

    const chartTileUuidsToLoad = useMemo(() => {
        if (!dashboardTiles) return undefined;

        // If tabs exist, but no active tab is specified, tiles are not loaded
        if (dashboardTabs && dashboardTabs.length > 0 && !activeTab)
            return undefined;

        return (
            dashboardTiles
                .filter(isDashboardChartTileType)
                // Without an active tab, include all tiles (backwards compatibility)
                .filter(isTileOnActiveTab)
                .map((tile) => tile.uuid)
        );
    }, [dashboardTiles, activeTab, dashboardTabs, isTileOnActiveTab]);

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const allFilters = useDashboardAllFilters();
    const parameterValues = useDashboardSelector(selectParameterValues);
    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const refreshCounter = useDashboardSelector(selectRefreshCounter);
    const { embedToken } = useEmbed();

    const visibleEmbedTileUuids = useMemo(() => {
        if (!dashboardTiles) return [];

        const visibleTabs = dashboardTabs.filter((tab) => !tab.hidden);
        const firstVisibleTabUuid = visibleTabs[0]?.uuid;

        return dashboardTiles
            .filter((tile) => {
                if (!activeTab) return true;
                if (tile.tabUuid === activeTab.uuid) return true;
                return !tile.tabUuid && activeTab.uuid === firstVisibleTabUuid;
            })
            .map((tile) => tile.uuid)
            .sort();
    }, [activeTab, dashboardTabs, dashboardTiles]);

    const embedLoadCycleKey = useMemo(
        () =>
            JSON.stringify({
                dashboardUuid: dashboard?.uuid,
                activeTabUuid: activeTab?.uuid,
                tileUuids: visibleEmbedTileUuids,
                allFilters,
                parameterValues,
                dateZoomGranularity,
                refreshCounter,
            }),
        [
            activeTab?.uuid,
            allFilters,
            dashboard?.uuid,
            dateZoomGranularity,
            parameterValues,
            refreshCounter,
            visibleEmbedTileUuids,
        ],
    );
    // In embeds the identity must change with the load cycle, so tiles that
    // don't re-query re-run their effect and count as settled in the new cycle.
    // Outside embeds it's unused and stays stable.
    const embedTileCycleKey = embedToken ? embedLoadCycleKey : undefined;
    const markEmbedTileComplete = useCallback(
        (tileUuid: string) => {
            if (embedTileCycleKey === undefined) return;
            dispatch(
                dashboardTileStatusActions.markEmbedTileComplete({
                    tileUuid,
                    cycleKey: embedTileCycleKey,
                }),
            );
        },
        [dispatch, embedTileCycleKey],
    );

    const addAvailableCustomGranularities = useCallback(
        (granularities: Record<string, string>) => {
            dispatch(
                dashboardTileStatusActions.addAvailableCustomGranularities(
                    granularities,
                ),
            );
        },
        [dispatch],
    );

    const markTileScreenshotReady = useCallback(
        (tileUuid: string) => {
            dispatch(
                dashboardTileStatusActions.markTileScreenshotReady(tileUuid),
            );
        },
        [dispatch],
    );

    const markTileScreenshotErrored = useCallback(
        (tileUuid: string) => {
            dispatch(
                dashboardTileStatusActions.markTileScreenshotErrored(tileUuid),
            );
        },
        [dispatch],
    );

    const markTileScreenshotLoading = useCallback(
        (tileUuid: string) => {
            dispatch(
                dashboardTileStatusActions.markTileScreenshotLoading(tileUuid),
            );
        },
        [dispatch],
    );

    const expectedScreenshotTileUuids = useMemo(() => {
        if (!dashboardTiles) return [];

        // When schedulerTabsSelected is provided, use it to filter tiles for screenshots
        if (schedulerTabsSelected && schedulerTabsSelected.length > 0) {
            if (exportPagedTabs) {
                // Paged export: mirror the backend's rendered-tile set exactly
                // via the shared isTileInPagedExport predicate, so readiness
                // never waits on a chart the frontend won't render. Orphans
                // ride the first resolved tab (drop the null sentinel here).
                const resolvedTabUuids = schedulerTabsSelected.filter(
                    (t): t is string => t !== null,
                );
                return dashboardTiles
                    .filter(
                        (tile) =>
                            isDashboardChartTileType(tile) ||
                            isDashboardSqlChartTile(tile) ||
                            isDashboardDataAppTileType(tile),
                    )
                    .filter((tile) =>
                        isTileInPagedExport(tile, resolvedTabUuids),
                    )
                    .map((tile) => tile.uuid);
            }
            // Stacked multi-tab image: mirror MinimalDashboard, which renders
            // orphans for any selection, with or without the null sentinel.
            return dashboardTiles
                .filter(
                    (tile) =>
                        isDashboardChartTileType(tile) ||
                        isDashboardSqlChartTile(tile) ||
                        isDashboardDataAppTileType(tile),
                )
                .filter((tile) =>
                    isTileInSelectedTabs(tile, schedulerTabsSelected),
                )
                .map((tile) => tile.uuid);
        }

        if (dashboardTabs && dashboardTabs.length > 0 && !activeTab) return [];

        return dashboardTiles
            .filter(
                (tile) =>
                    isDashboardChartTileType(tile) ||
                    isDashboardSqlChartTile(tile) ||
                    isDashboardDataAppTileType(tile),
            )
            .filter(isTileOnActiveTab)
            .map((tile) => tile.uuid);
    }, [
        dashboardTiles,
        activeTab,
        dashboardTabs,
        isTileOnActiveTab,
        schedulerTabsSelected,
        exportPagedTabs,
    ]);

    useEffect(() => {
        dispatch(dashboardTileStatusActions.resetScreenshotTiles());
    }, [dispatch, dashboardTiles, activeTab]);

    // Tile names keyed by uuid; moving or resizing tiles keeps them (and the
    // pre-aggregate statuses derived from them) stable
    const tileNamesKey = JSON.stringify(
        dashboardTiles?.map((tile) => [
            tile.uuid,
            tile.properties.title,
            isDashboardChartTileType(tile) ? tile.properties.chartName : null,
        ]) ?? null,
    );
    const tileNamesById = useMemo(() => {
        if (!dashboardTiles) return {};

        return dashboardTiles.reduce<Record<string, string>>((acc, tile) => {
            const tileWithoutTitle =
                !tile.properties.title || tile.properties.title.length === 0;
            const isChartTileType = isDashboardChartTileType(tile);

            let tileName = '';
            if (tileWithoutTitle && isChartTileType) {
                tileName = tile.properties.chartName || '';
            } else if (tile.properties.title) {
                tileName = tile.properties.title;
            }

            acc[tile.uuid] = tileName;
            return acc;
        }, {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tileNamesKey]);

    const addResultsCacheTime = useCallback(
        (cacheMetadata?: CacheMetadata) => {
            dispatch(
                dashboardTileStatusActions.addResultsCacheTime(cacheMetadata),
            );
        },
        [dispatch],
    );

    // Clears the cache time and loaded tiles, sets invalidateCache (causes
    // results refetch) and bumps refreshCounter, which drives the iframe reload
    // for data-app tiles (charts re-fetch via React Query invalidation, which
    // happens separately in the refresh button). Bumping every call covers
    // repeat refreshes — unlike invalidateCache, which is sticky once true.
    const clearCacheAndFetch = useCallback(() => {
        dispatch(dashboardTileStatusActions.refresh());
    }, [dispatch]);

    const updateSqlChartTilesMetadata = useCallback(
        (tileUuid: string, metadata: SqlChartTileMetadata) => {
            dispatch(
                dashboardTileStatusActions.updateSqlChartTilesMetadata({
                    tileUuid,
                    metadata,
                }),
            );
        },
        [dispatch],
    );

    const { health } = useApp();
    const { pathname } = useLocation();
    const isEmbedded = !!embedToken;
    const isMinimal = pathname.startsWith('/minimal');
    const preAggregatesEnabled = health.data?.preAggregates.enabled ?? false;
    const { data: auditData } = useDashboardPreAggregateAudit({
        projectUuid,
        dashboardUuid: dashboard?.uuid,
        dashboardFilters: allFilters,
        enabled: !isEmbedded && !isMinimal && preAggregatesEnabled,
    });
    const preAggregateStatuses = useMemo<
        Record<string, TilePreAggregateStatus>
    >(
        () =>
            auditData
                ? auditResponseToTileStatuses(auditData, tileNamesById)
                : {},
        [auditData, tileNamesById],
    );

    const value = useMemo(
        () => ({
            addResultsCacheTime,
            preAggregateStatuses,
            setIsAutoRefresh,
            clearCacheAndFetch,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            markEmbedTileComplete,
            chartTileUuidsToLoad,
            addAvailableCustomGranularities,
            tileNamesById,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            markTileScreenshotLoading,
            hasDashboardTiles: !!dashboardTiles,
            expectedScreenshotTileUuids,
        }),
        [
            addResultsCacheTime,
            preAggregateStatuses,
            setIsAutoRefresh,
            clearCacheAndFetch,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            markEmbedTileComplete,
            chartTileUuidsToLoad,
            addAvailableCustomGranularities,
            tileNamesById,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            markTileScreenshotLoading,
            dashboardTiles,
            expectedScreenshotTileUuids,
        ],
    );

    return (
        <DashboardTileStatusContext.Provider value={value}>
            {children}
            {/* After children so its effect runs after the tiles', as when it lived in this provider */}
            <EmbedAllTilesLoadedSync
                embedLoadCycleKey={embedLoadCycleKey}
                visibleEmbedTileUuids={visibleEmbedTileUuids}
                hasDashboardTiles={!!dashboardTiles}
            />
        </DashboardTileStatusContext.Provider>
    );
};

/** Tells the embed host once every visible tile settled in a load cycle */
const EmbedAllTilesLoadedSync: React.FC<{
    embedLoadCycleKey: string;
    visibleEmbedTileUuids: string[];
    hasDashboardTiles: boolean;
}> = ({ embedLoadCycleKey, visibleEmbedTileUuids, hasDashboardTiles }) => {
    const { embedToken, dispatchEmbedEvent, isEmbedEventReady } = useEmbed();
    const completedEmbedTiles = useDashboardSelector(selectCompletedEmbedTiles);
    const currentCompletedEmbedTiles =
        completedEmbedTiles.cycleKey === embedLoadCycleKey
            ? completedEmbedTiles.tileUuids
            : new Set<string>();
    const areAllEmbedTilesLoaded =
        hasDashboardTiles &&
        visibleEmbedTileUuids.every((tileUuid) =>
            currentCompletedEmbedTiles.has(tileUuid),
        );
    const loadCycleTiming = useRef({
        cycleKey: embedLoadCycleKey,
        startedAt: performance.now(),
    });
    useLayoutEffect(() => {
        if (loadCycleTiming.current.cycleKey !== embedLoadCycleKey) {
            loadCycleTiming.current = {
                cycleKey: embedLoadCycleKey,
                startedAt: performance.now(),
            };
        }
    }, [embedLoadCycleKey]);
    const emittedLoadCycle = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!embedToken || !isEmbedEventReady || !areAllEmbedTilesLoaded)
            return;
        if (emittedLoadCycle.current === embedLoadCycleKey) return;

        const dispatched = dispatchEmbedEvent(
            LightdashEventType.AllTilesLoaded,
            {
                tilesCount: visibleEmbedTileUuids.length,
                loadTimeMs: Math.max(
                    0,
                    Math.round(
                        performance.now() - loadCycleTiming.current.startedAt,
                    ),
                ),
            },
        );
        if (dispatched) emittedLoadCycle.current = embedLoadCycleKey;
    }, [
        areAllEmbedTilesLoaded,
        dispatchEmbedEvent,
        embedLoadCycleKey,
        embedToken,
        isEmbedEventReady,
        visibleEmbedTileUuids,
    ]);
    return null;
};

export default DashboardTileStatusProvider;
