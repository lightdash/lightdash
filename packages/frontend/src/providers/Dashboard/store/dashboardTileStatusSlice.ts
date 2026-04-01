import { type CacheMetadata } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import min from 'lodash/min';
import {
    type SqlChartTileMetadata,
    type TilePreAggregateStatus,
} from '../types';

// ts-unused-exports:disable-next-line
export type DashboardTileStatusState = {
    oldestCacheTime: Date | undefined;
    preAggregateStatuses: Record<string, TilePreAggregateStatus>;
    invalidateCache: boolean;
    isAutoRefresh: boolean;
    loadedTiles: string[];
    tilesWithTimestampDimension: string[];
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>;
    availableCustomGranularities: Record<string, string>;
    screenshotReadyTiles: string[];
    screenshotErroredTiles: string[];
};

const initialState: DashboardTileStatusState = {
    oldestCacheTime: undefined,
    preAggregateStatuses: {},
    invalidateCache: false,
    isAutoRefresh: false,
    loadedTiles: [],
    tilesWithTimestampDimension: [],
    sqlChartTilesMetadata: {},
    availableCustomGranularities: {},
    screenshotReadyTiles: [],
    screenshotErroredTiles: [],
};

// ts-unused-exports:disable-next-line
export const dashboardTileStatusSlice = createSlice({
    name: 'dashboardTileStatus',
    initialState,
    reducers: {
        addCacheTime: (
            state,
            action: PayloadAction<CacheMetadata | undefined>,
        ) => {
            const meta = action.payload;
            if (!meta?.cacheHit || !meta?.cacheUpdatedTime) return;
            const newTime = meta.cacheUpdatedTime;
            state.oldestCacheTime =
                state.oldestCacheTime === undefined
                    ? newTime
                    : min([state.oldestCacheTime, newTime])!;
        },
        addPreAggregateStatus: (
            state,
            action: PayloadAction<{
                tileUuid: string;
                tileName: string;
                tabUuid: string | null | undefined;
                cacheMetadata: CacheMetadata | undefined;
            }>,
        ) => {
            const { tileUuid, tileName, tabUuid, cacheMetadata } =
                action.payload;
            const preAggregate = cacheMetadata?.preAggregate ?? null;
            state.preAggregateStatuses[tileUuid] = {
                tileUuid,
                tileName,
                hit: preAggregate?.hit ?? false,
                preAggregateName: preAggregate?.name ?? null,
                reason: preAggregate?.reason ?? null,
                hasPreAggregateMetadata: preAggregate !== null,
                tabUuid,
            };
        },
        setInvalidateCache: (state, action: PayloadAction<boolean>) => {
            state.invalidateCache = action.payload;
        },
        setIsAutoRefresh: (state, action: PayloadAction<boolean>) => {
            state.isAutoRefresh = action.payload;
        },
        markTileLoaded: (state, action: PayloadAction<string>) => {
            if (!state.loadedTiles.includes(action.payload)) {
                state.loadedTiles.push(action.payload);
            }
        },
        setTileHasTimestampDimension: (
            state,
            action: PayloadAction<{
                tileUuid: string;
                hasTimestamp: boolean;
            }>,
        ) => {
            const { tileUuid, hasTimestamp } = action.payload;
            const idx = state.tilesWithTimestampDimension.indexOf(tileUuid);
            if (hasTimestamp && idx === -1) {
                state.tilesWithTimestampDimension.push(tileUuid);
            } else if (!hasTimestamp && idx !== -1) {
                state.tilesWithTimestampDimension.splice(idx, 1);
            }
        },
        updateSqlChartTileMetadata: (
            state,
            action: PayloadAction<{
                tileUuid: string;
                metadata: SqlChartTileMetadata;
            }>,
        ) => {
            state.sqlChartTilesMetadata[action.payload.tileUuid] =
                action.payload.metadata;
        },
        addAvailableCustomGranularities: (
            state,
            action: PayloadAction<Record<string, string>>,
        ) => {
            const newKeys = Object.keys(action.payload).filter(
                (k) => !(k in state.availableCustomGranularities),
            );
            if (newKeys.length > 0) {
                Object.assign(
                    state.availableCustomGranularities,
                    action.payload,
                );
            }
        },
        markTileScreenshotReady: (state, action: PayloadAction<string>) => {
            if (!state.screenshotReadyTiles.includes(action.payload)) {
                state.screenshotReadyTiles.push(action.payload);
            }
        },
        markTileScreenshotErrored: (state, action: PayloadAction<string>) => {
            if (!state.screenshotErroredTiles.includes(action.payload)) {
                state.screenshotErroredTiles.push(action.payload);
            }
        },
        resetScreenshotTiles: (state) => {
            state.screenshotReadyTiles = [];
            state.screenshotErroredTiles = [];
        },
        clearForRefresh: (state) => {
            state.oldestCacheTime = undefined;
            state.preAggregateStatuses = {};
            state.loadedTiles = [];
            state.invalidateCache = true;
        },
    },
});

// ts-unused-exports:disable-next-line
export const dashboardTileStatusActions = dashboardTileStatusSlice.actions;
// ts-unused-exports:disable-next-line
export const dashboardTileStatusReducer = dashboardTileStatusSlice.reducer;
