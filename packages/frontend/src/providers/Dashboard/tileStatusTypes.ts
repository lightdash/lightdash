import { type CacheMetadata } from '@lightdash/common';
import {
    type SqlChartTileMetadata,
    type TilePreAggregateStatus,
} from './types';

export type DashboardTileStatusContextType = {
    oldestCacheTime: Date | undefined;
    addResultsCacheTime: (cacheMetadata?: CacheMetadata) => void;
    preAggregateStatuses: Record<string, TilePreAggregateStatus>;
    invalidateCache: boolean | undefined;
    /**
     * Monotonic counter bumped on every manual/auto refresh (via
     * `clearCacheAndFetch`). Chart tiles re-fetch through React Query
     * invalidation, but data-app tiles run their queries inside an iframe that
     * only re-fires them on reload — they bake this counter into the iframe URL
     * to force that reload. See `DashboardDataAppTile`.
     */
    refreshCounter: number;
    isAutoRefresh: boolean;
    setIsAutoRefresh: (autoRefresh: boolean) => void;
    clearCacheAndFetch: () => void;
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>;
    updateSqlChartTilesMetadata: (
        tileUuid: string,
        metadata: SqlChartTileMetadata,
    ) => void;
    markTileLoaded: (tileUuid: string) => void;
    areAllChartsLoaded: boolean;
    availableCustomGranularities: Record<string, string>;
    addAvailableCustomGranularities: (
        granularities: Record<string, string>,
    ) => void;
    tileNamesById: Record<string, string>;
    markTileScreenshotReady: (tileUuid: string) => void;
    markTileScreenshotErrored: (tileUuid: string) => void;
    isReadyForScreenshot: boolean;
    screenshotReadyTilesCount: number;
    screenshotErroredTilesCount: number;
    expectedScreenshotTilesCount: number;
    expectedScreenshotTileUuids: string[];
    screenshotReadyTileUuids: string[];
    screenshotErroredTileUuids: string[];
};
