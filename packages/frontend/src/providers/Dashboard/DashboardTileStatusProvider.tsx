import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type CacheMetadata,
    type Dashboard,
} from '@lightdash/common';
import min from 'lodash/min';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    auditResponseToTileStatuses,
    useDashboardPreAggregateAudit,
} from '../../hooks/dashboard/useDashboardPreAggregateAudit';
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
    schedulerTabsSelected?: string[] | undefined;
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
    const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

    const [oldestCacheTime, setOldestCacheTime] = useState<Date | undefined>();
    const [invalidateCache, setInvalidateCache] = useState<boolean>(
        defaultInvalidateCache === true,
    );

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

    // Track which tiles have TIMESTAMP dimensions; derive boolean from set size
    const [tilesWithTimestampDimension, setTilesWithTimestampDimension] =
        useState<Set<string>>(new Set());
    const dashboardHasTimestampDimension = tilesWithTimestampDimension.size > 0;

    const setTileHasTimestampDimension = useCallback(
        (tileUuid: string, hasTimestamp: boolean) => {
            setTilesWithTimestampDimension((prev) => {
                // If the current state already matches the desired, return it
                if (prev.has(tileUuid) === hasTimestamp) {
                    return prev;
                }
                const next = new Set(prev);
                if (hasTimestamp) {
                    next.add(tileUuid);
                } else {
                    next.delete(tileUuid);
                }
                return next;
            });
        },
        [],
    );

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
            return dashboardTiles
                .filter(
                    (tile) =>
                        isDashboardChartTileType(tile) ||
                        isDashboardSqlChartTile(tile),
                )
                .filter((tile) => schedulerTabsSelected.includes(tile.tabUuid!))
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
    }, [dashboardTiles, activeTab, dashboardTabs, schedulerTabsSelected]);

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

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const { embedToken } = useEmbed();
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
            isAutoRefresh,
            setIsAutoRefresh,
            clearCacheAndFetch,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            areAllChartsLoaded,
            dashboardHasTimestampDimension,
            setTileHasTimestampDimension,
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
            isAutoRefresh,
            clearCacheAndFetch,
            sqlChartTilesMetadata,
            updateSqlChartTilesMetadata,
            markTileLoaded,
            areAllChartsLoaded,
            dashboardHasTimestampDimension,
            setTileHasTimestampDimension,
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
