import { type CacheMetadata } from '@lightdash/common';
import {
    type SqlChartTileMetadata,
    type TilePreAggregateStatus,
} from './types';

// Values that change on tile reports (loaded tiles, cache time, refresh
// counter, ...) live in the dashboard store; see `selectRefreshCounter` et al.
export type DashboardTileStatusContextType = {
    addResultsCacheTime: (cacheMetadata?: CacheMetadata) => void;
    preAggregateStatuses: Record<string, TilePreAggregateStatus>;
    setIsAutoRefresh: (autoRefresh: boolean) => void;
    clearCacheAndFetch: () => void;
    updateSqlChartTilesMetadata: (
        tileUuid: string,
        metadata: SqlChartTileMetadata,
    ) => void;
    markTileLoaded: (tileUuid: string) => void;
    /** Marks a visible embed tile as settled for the current load cycle. */
    markEmbedTileComplete: (tileUuid: string) => void;
    /** Chart tiles that must load before all charts count as loaded; undefined while unknown */
    chartTileUuidsToLoad: string[] | undefined;
    addAvailableCustomGranularities: (
        granularities: Record<string, string>,
    ) => void;
    tileNamesById: Record<string, string>;
    markTileScreenshotReady: (tileUuid: string) => void;
    markTileScreenshotErrored: (tileUuid: string) => void;
    markTileScreenshotLoading: (tileUuid: string) => void;
    hasDashboardTiles: boolean;
    expectedScreenshotTileUuids: string[];
};
