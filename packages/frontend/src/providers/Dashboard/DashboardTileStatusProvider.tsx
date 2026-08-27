import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    isTileInPagedExport,
    type CacheMetadata,
    type Dashboard,
} from '@lightdash/common';
import min from 'lodash/min';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLocation } from 'react-router';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import { useEmbedEventEmitter } from '../../ee/features/embed/hooks/useEmbedEventEmitter';
import useEmbed from '../../ee/providers/Embed/useEmbed';
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
    defaultInvalidateCache?: boolean;
    children: React.ReactNode;
};

const DashboardTileStatusProvider: React.FC<
    DashboardTileStatusProviderProps
> = ({
    dashboardTiles,
    dashboardTabs,
    activeTab,
    schedulerTabsSelected,
    defaultInvalidateCache,
    children,
}) => {
    const exportPagedTabs = useSearchParams('exportPagedTabs') === 'true';

    const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

    const [oldestCacheTime, setOldestCacheTime] = useState<Date | undefined>();
    const [invalidateCache, setInvalidateCache] = useState<boolean>(
        defaultInvalidateCache === true,
    );

    // Bumped on every refresh so iframe-based tiles (data apps) can force a
    // reload — they can't piggyback on React Query invalidation like charts do.
    const [refreshCounter, setRefreshCounter] = useState<number>(0);

    const [sqlChartTilesMetadata, setSqlChartTilesMetadata] = useState<
        Record<string, SqlChartTileMetadata>
    >({});

    // Track which tiles have loaded (to know when all are complete)
    const [loadedTiles, setLoadedTiles] = useState<Set<string>>(new Set());

    const markTileLoaded = useCallback((tileUuid: string) => {
        setLoadedTiles((prev) => new Set(prev).add(tileUuid));
    }, []);

    // Determine if all chart tiles have loaded
    const areAllChartsLoaded = useMemo(() => {
        if (!dashboardTiles) return false;

        // If tabs exist, but no active tab is specified, tiles are not loaded
        if (dashboardTabs && dashboardTabs.length > 0 && !activeTab)
            return false;

        const chartTileUuids = dashboardTiles
            .filter(isDashboardChartTileType)
            .filter((tile) => {
                // If no active tab specified, include all tiles (backwards compatibility)
                if (!activeTab) return true;

                // If tabs exist, only include tiles from the active tab or no tabUuid
                return !tile.tabUuid || tile.tabUuid === activeTab.uuid;
            })
            .map((tile) => tile.uuid);

        return chartTileUuids.every((tileUuid) => loadedTiles.has(tileUuid));
    }, [dashboardTiles, loadedTiles, activeTab, dashboardTabs]);

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const { embedToken } = useEmbed();
    const { dispatchEmbedEvent } = useEmbedEventEmitter();

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
    const [completedEmbedTiles, setCompletedEmbedTiles] = useState<{
        cycleKey: string;
        tileUuids: Set<string>;
    }>(() => ({ cycleKey: embedLoadCycleKey, tileUuids: new Set() }));
    const markEmbedTileComplete = useCallback(
        (tileUuid: string) => {
            if (!embedToken) return;

            setCompletedEmbedTiles((current) => {
                const tileUuids =
                    current.cycleKey === embedLoadCycleKey
                        ? new Set(current.tileUuids)
                        : new Set<string>();

                if (tileUuids.has(tileUuid)) return current;
                tileUuids.add(tileUuid);

                return { cycleKey: embedLoadCycleKey, tileUuids };
            });
        },
        [embedLoadCycleKey, embedToken],
    );
    const currentCompletedEmbedTiles =
        completedEmbedTiles.cycleKey === embedLoadCycleKey
            ? completedEmbedTiles.tileUuids
            : new Set<string>();
    const areAllEmbedTilesLoaded =
        !!dashboardTiles &&
        visibleEmbedTileUuids.every((tileUuid) =>
            currentCompletedEmbedTiles.has(tileUuid),
        );
    const loadCycleTiming = useRef({
        cycleKey: embedLoadCycleKey,
        startedAt: performance.now(),
    });
    if (loadCycleTiming.current.cycleKey !== embedLoadCycleKey) {
        loadCycleTiming.current = {
            cycleKey: embedLoadCycleKey,
            startedAt: performance.now(),
        };
    }
    const emittedLoadCycle = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!embedToken || !areAllEmbedTilesLoaded) return;
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
        visibleEmbedTileUuids.length,
    ]);

    // Custom granularities discovered from explores: key -> label (e.g., "fiscal_quarter" -> "Fiscal Quarter")
    const [availableCustomGranularities, setAvailableCustomGranularities] =
        useState<Record<string, string>>({});

    const addAvailableCustomGranularities = useCallback(
        (granularities: Record<string, string>) => {
            setAvailableCustomGranularities((prev) => {
                const newKeys = Object.keys(granularities).filter(
                    (k) => !(k in prev),
                );
                if (newKeys.length === 0) return prev;
                return { ...prev, ...granularities };
            });
        },
        [],
    );

    const [screenshotReadyTiles, setScreenshotReadyTiles] = useState<
        Set<string>
    >(new Set());
    const [screenshotErroredTiles, setScreenshotErroredTiles] = useState<
        Set<string>
    >(new Set());

    const markTileScreenshotReady = useCallback((tileUuid: string) => {
        setScreenshotReadyTiles((prev) => new Set(prev).add(tileUuid));
    }, []);

    const markTileScreenshotErrored = useCallback((tileUuid: string) => {
        setScreenshotErroredTiles((prev) => new Set(prev).add(tileUuid));
    }, []);

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
                            isDashboardSqlChartTile(tile),
                    )
                    .filter((tile) =>
                        isTileInPagedExport(tile, resolvedTabUuids),
                    )
                    .map((tile) => tile.uuid);
            }
            // Stacked multi-tab image: orphans ride the aggregated view (null
            // sentinel is present in the selection). Existing behaviour.
            return dashboardTiles
                .filter(
                    (tile) =>
                        isDashboardChartTileType(tile) ||
                        isDashboardSqlChartTile(tile),
                )
                .filter((tile) =>
                    schedulerTabsSelected.includes(tile.tabUuid ?? null),
                )
                .map((tile) => tile.uuid);
        }

        if (dashboardTabs && dashboardTabs.length > 0 && !activeTab) return [];

        return dashboardTiles
            .filter(
                (tile) =>
                    isDashboardChartTileType(tile) ||
                    isDashboardSqlChartTile(tile),
            )
            .filter((tile) => {
                if (!activeTab) return true;
                return !tile.tabUuid || tile.tabUuid === activeTab.uuid;
            })
            .map((tile) => tile.uuid);
    }, [
        dashboardTiles,
        activeTab,
        dashboardTabs,
        schedulerTabsSelected,
        exportPagedTabs,
    ]);

    const isReadyForScreenshot = useMemo(() => {
        if (expectedScreenshotTileUuids.length === 0) {
            return !!dashboardTiles;
        }

        return expectedScreenshotTileUuids.every(
            (tileUuid) =>
                screenshotReadyTiles.has(tileUuid) ||
                screenshotErroredTiles.has(tileUuid),
        );
    }, [
        expectedScreenshotTileUuids,
        screenshotReadyTiles,
        screenshotErroredTiles,
        dashboardTiles,
    ]);

    useEffect(() => {
        setScreenshotReadyTiles(new Set());
        setScreenshotErroredTiles(new Set());
    }, [dashboardTiles, activeTab]);

    // Memoized mapping of tile UUIDs to their display names
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
    }, [dashboardTiles]);

    const addResultsCacheTime = useCallback((cacheMetadata?: CacheMetadata) => {
        if (
            cacheMetadata &&
            cacheMetadata.cacheHit &&
            cacheMetadata.cacheUpdatedTime
        ) {
            const newTime = cacheMetadata.cacheUpdatedTime;
            setOldestCacheTime((prev) =>
                prev === undefined ? newTime : min([prev, newTime])!,
            );
        }
    }, []);

    const clearCacheAndFetch = useCallback(() => {
        setOldestCacheTime(undefined);
        setLoadedTiles(new Set());

        // Causes results refetch
        setInvalidateCache(true);

        // Drives the iframe reload for data-app tiles (charts re-fetch via
        // React Query invalidation, which happens separately in the refresh
        // button). Bumping every call covers repeat refreshes — unlike
        // invalidateCache, which is sticky once true.
        setRefreshCounter((prev) => prev + 1);
    }, []);

    const updateSqlChartTilesMetadata = useCallback(
        (tileUuid: string, metadata: SqlChartTileMetadata) => {
            setSqlChartTilesMetadata((prev) => ({
                ...prev,
                [tileUuid]: metadata,
            }));
        },
        [],
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
            oldestCacheTime,
            addResultsCacheTime,
            preAggregateStatuses,
            invalidateCache,
            refreshCounter,
            isAutoRefresh,
            setIsAutoRefresh,
            clearCacheAndFetch,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            markEmbedTileComplete,
            areAllChartsLoaded,
            availableCustomGranularities,
            addAvailableCustomGranularities,
            tileNamesById,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            isReadyForScreenshot,
            screenshotReadyTilesCount: screenshotReadyTiles.size,
            screenshotErroredTilesCount: screenshotErroredTiles.size,
            expectedScreenshotTilesCount: expectedScreenshotTileUuids.length,
            expectedScreenshotTileUuids,
            screenshotReadyTileUuids: Array.from(screenshotReadyTiles),
            screenshotErroredTileUuids: Array.from(screenshotErroredTiles),
        }),
        [
            oldestCacheTime,
            addResultsCacheTime,
            preAggregateStatuses,
            invalidateCache,
            refreshCounter,
            isAutoRefresh,
            clearCacheAndFetch,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            markEmbedTileComplete,
            areAllChartsLoaded,
            availableCustomGranularities,
            addAvailableCustomGranularities,
            tileNamesById,
            markTileScreenshotReady,
            markTileScreenshotErrored,
            isReadyForScreenshot,
            screenshotReadyTiles,
            screenshotErroredTiles,
            expectedScreenshotTileUuids,
        ],
    );

    return (
        <DashboardTileStatusContext.Provider value={value}>
            {children}
        </DashboardTileStatusContext.Provider>
    );
};

export default DashboardTileStatusProvider;
