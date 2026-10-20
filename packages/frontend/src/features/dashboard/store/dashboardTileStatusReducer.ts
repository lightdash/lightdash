import { type CacheMetadata } from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import min from 'lodash/min';
import { type SqlChartTileMetadata } from '../../../providers/Dashboard/types';

export type DashboardTileStatusState = {
    loadedTiles: Set<string>;
    oldestCacheTime: Date | undefined;
    invalidateCache: boolean;
    /**
     * Monotonic counter bumped on every manual/auto refresh (via
     * `clearCacheAndFetch`). Chart tiles re-fetch through React Query
     * invalidation, but data-app tiles run their queries inside an iframe that
     * only re-fires them on reload — they bake this counter into the iframe URL
     * to force that reload. See `DashboardDataAppTile`.
     */
    refreshCounter: number;
    isAutoRefresh: boolean;
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>;
    // Custom granularities discovered from explores: key -> label (e.g., "fiscal_quarter" -> "Fiscal Quarter")
    availableCustomGranularities: Record<string, string>;
    screenshotReadyTiles: Set<string>;
    screenshotErroredTiles: Set<string>;
    /** Visible embed tiles that settled in the load cycle identified by `cycleKey` */
    completedEmbedTiles: { cycleKey: string; tileUuids: Set<string> };
};

export const initialDashboardTileStatusState: DashboardTileStatusState = {
    loadedTiles: new Set(),
    oldestCacheTime: undefined,
    invalidateCache: false,
    refreshCounter: 0,
    isAutoRefresh: false,
    sqlChartTilesMetadata: {},
    availableCustomGranularities: {},
    screenshotReadyTiles: new Set(),
    screenshotErroredTiles: new Set(),
    completedEmbedTiles: { cycleKey: '', tileUuids: new Set() },
};

export const dashboardTileStatusActions = {
    markTileLoaded: createAction<string>('dashboardTileStatus/markTileLoaded'),
    addResultsCacheTime: createAction<CacheMetadata | undefined>(
        'dashboardTileStatus/addResultsCacheTime',
    ),
    /** Clears the cache time and loaded tiles, invalidates the cache and bumps the refresh counter */
    refresh: createAction('dashboardTileStatus/refresh'),
    setIsAutoRefresh: createAction<boolean>(
        'dashboardTileStatus/setIsAutoRefresh',
    ),
    updateSqlChartTilesMetadata: createAction<{
        tileUuid: string;
        metadata: SqlChartTileMetadata;
    }>('dashboardTileStatus/updateSqlChartTilesMetadata'),
    addAvailableCustomGranularities: createAction<Record<string, string>>(
        'dashboardTileStatus/addAvailableCustomGranularities',
    ),
    markTileScreenshotReady: createAction<string>(
        'dashboardTileStatus/markTileScreenshotReady',
    ),
    markTileScreenshotErrored: createAction<string>(
        'dashboardTileStatus/markTileScreenshotErrored',
    ),
    markTileScreenshotLoading: createAction<string>(
        'dashboardTileStatus/markTileScreenshotLoading',
    ),
    resetScreenshotTiles: createAction(
        'dashboardTileStatus/resetScreenshotTiles',
    ),
    markEmbedTileComplete: createAction<{
        tileUuid: string;
        cycleKey: string;
    }>('dashboardTileStatus/markEmbedTileComplete'),
};

const withTile = (tiles: Set<string>, tileUuid: string) =>
    tiles.has(tileUuid) ? tiles : new Set(tiles).add(tileUuid);

const withoutTile = (tiles: Set<string>, tileUuid: string) => {
    if (!tiles.has(tileUuid)) return tiles;
    const next = new Set(tiles);
    next.delete(tileUuid);
    return next;
};

const emptyTiles = (tiles: Set<string>) =>
    tiles.size === 0 ? tiles : new Set<string>();

export const dashboardTileStatusReducer = (
    state: DashboardTileStatusState = initialDashboardTileStatusState,
    action: UnknownAction,
): DashboardTileStatusState => {
    if (dashboardTileStatusActions.markTileLoaded.match(action)) {
        const loadedTiles = withTile(state.loadedTiles, action.payload);
        return loadedTiles === state.loadedTiles
            ? state
            : { ...state, loadedTiles };
    }
    if (dashboardTileStatusActions.addResultsCacheTime.match(action)) {
        const cacheMetadata = action.payload;
        if (!cacheMetadata?.cacheHit || !cacheMetadata.cacheUpdatedTime) {
            return state;
        }
        const newTime = cacheMetadata.cacheUpdatedTime;
        const oldestCacheTime =
            state.oldestCacheTime === undefined
                ? newTime
                : min([state.oldestCacheTime, newTime])!;
        return oldestCacheTime === state.oldestCacheTime
            ? state
            : { ...state, oldestCacheTime };
    }
    if (dashboardTileStatusActions.refresh.match(action)) {
        return {
            ...state,
            oldestCacheTime: undefined,
            loadedTiles: new Set(),
            invalidateCache: true,
            refreshCounter: state.refreshCounter + 1,
        };
    }
    if (dashboardTileStatusActions.setIsAutoRefresh.match(action)) {
        return state.isAutoRefresh === action.payload
            ? state
            : { ...state, isAutoRefresh: action.payload };
    }
    if (dashboardTileStatusActions.updateSqlChartTilesMetadata.match(action)) {
        const { tileUuid, metadata } = action.payload;
        return {
            ...state,
            sqlChartTilesMetadata: {
                ...state.sqlChartTilesMetadata,
                [tileUuid]: metadata,
            },
        };
    }
    if (
        dashboardTileStatusActions.addAvailableCustomGranularities.match(action)
    ) {
        const granularities = action.payload;
        const hasNewKey = Object.keys(granularities).some(
            (key) => !(key in state.availableCustomGranularities),
        );
        if (!hasNewKey) return state;
        return {
            ...state,
            availableCustomGranularities: {
                ...state.availableCustomGranularities,
                ...granularities,
            },
        };
    }
    if (dashboardTileStatusActions.markTileScreenshotReady.match(action)) {
        const screenshotReadyTiles = withTile(
            state.screenshotReadyTiles,
            action.payload,
        );
        return screenshotReadyTiles === state.screenshotReadyTiles
            ? state
            : { ...state, screenshotReadyTiles };
    }
    if (dashboardTileStatusActions.markTileScreenshotErrored.match(action)) {
        const screenshotErroredTiles = withTile(
            state.screenshotErroredTiles,
            action.payload,
        );
        return screenshotErroredTiles === state.screenshotErroredTiles
            ? state
            : { ...state, screenshotErroredTiles };
    }
    if (dashboardTileStatusActions.markTileScreenshotLoading.match(action)) {
        const screenshotReadyTiles = withoutTile(
            state.screenshotReadyTiles,
            action.payload,
        );
        const screenshotErroredTiles = withoutTile(
            state.screenshotErroredTiles,
            action.payload,
        );
        return screenshotReadyTiles === state.screenshotReadyTiles &&
            screenshotErroredTiles === state.screenshotErroredTiles
            ? state
            : { ...state, screenshotReadyTiles, screenshotErroredTiles };
    }
    if (dashboardTileStatusActions.resetScreenshotTiles.match(action)) {
        const screenshotReadyTiles = emptyTiles(state.screenshotReadyTiles);
        const screenshotErroredTiles = emptyTiles(state.screenshotErroredTiles);
        return screenshotReadyTiles === state.screenshotReadyTiles &&
            screenshotErroredTiles === state.screenshotErroredTiles
            ? state
            : { ...state, screenshotReadyTiles, screenshotErroredTiles };
    }
    if (dashboardTileStatusActions.markEmbedTileComplete.match(action)) {
        const { tileUuid, cycleKey } = action.payload;
        const current =
            state.completedEmbedTiles.cycleKey === cycleKey
                ? state.completedEmbedTiles.tileUuids
                : new Set<string>();
        if (current.has(tileUuid)) return state;
        return {
            ...state,
            completedEmbedTiles: {
                cycleKey,
                tileUuids: new Set(current).add(tileUuid),
            },
        };
    }
    return state;
};
