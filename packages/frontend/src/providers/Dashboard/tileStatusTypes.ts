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
    dashboardHasTimestampDimension: boolean;
    setTileHasTimestampDimension: (
        tileUuid: string,
        hasTimestamp: boolean,
    ) => void;
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
