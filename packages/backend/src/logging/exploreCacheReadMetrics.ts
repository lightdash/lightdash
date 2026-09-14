import {
    isExploreError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';

const isExploreCacheReadStorageBytesEnabled = () =>
    process.env.LIGHTDASH_EXPLORE_CACHE_READ_STORAGE_BYTES !== 'false';

/**
 * Identifies which PROD-10912 call site produced a cached-explore-read log
 * line, so the same field can be compared across the full-JSON read done
 * today and the table-summary projection PROD-10912 introduces.
 */
export type ExploreCacheReadCodePath =
    | 'catalog'
    | 'catalog-browse'
    | 'catalog-search'
    | 'dbt-exposures'
    | 'split-lookup'
    | 'review-writeback';

export type ExploreCacheReadContext = {
    codePath: ExploreCacheReadCodePath;
    readStrategy:
        | 'full-explore-read'
        | 'table-summary-projection'
        | 'catalog-search-count'
        | 'catalog-search-distinct-explore-hydration';
    exploreCount: number;
    tableFanOut: number;
    /** Length of the explore-name filter passed to the cache read, if any. */
    requestedExploreCount: number | undefined;
    /**
     * Sum of `pg_column_size(explore)` for the matched rows, in bytes.
     * `undefined` if the storage-size query failed - never block or slow
     * the request for this.
     */
    storedExploreBytes: number | undefined;
    /**
     * Driver-read time for the cache read, in ms. This includes query
     * execution, transfer, protocol decoding, driver JSON parsing, scheduling
     * and GC. It is populated for catalog-browse page reads and catalog-search
     * count/page reads. Best-effort: measured with performance.now() around
     * the existing read, with no extra queries.
     */
    dbReadMs: number | undefined;
    /**
     * Node-side user-attribute filtering time, in ms
     * (`doesExploreMatchRequiredAttributes` + `getFilteredExplore` over every
     * explore). Only populated on codePath 'catalog-browse' (trigger 'page').
     */
    attributeFilterMs: number | undefined;
};

export type CatalogSearchExploreCacheReadContext = ExploreCacheReadContext & {
    page: number | undefined;
    pageSize: number | undefined;
    totalResultCount: number | undefined;
    returnedSqlRowCount: number | undefined;
    returnedCatalogRowCount: number | undefined;
    distinctExploreCount: number | undefined;
    selectedExploreJsonBytes: number | undefined;
};

export const newExploreCacheReadContext = (
    codePath: ExploreCacheReadCodePath,
    requestedExploreCount: number | undefined,
): ExploreCacheReadContext => ({
    codePath,
    readStrategy: 'full-explore-read',
    exploreCount: 0,
    tableFanOut: 0,
    requestedExploreCount,
    storedExploreBytes: undefined,
    dbReadMs: undefined,
    attributeFilterMs: undefined,
});

export const newCatalogSearchExploreCacheReadContext = (
    page: number | undefined,
    pageSize: number | undefined,
): CatalogSearchExploreCacheReadContext => ({
    ...newExploreCacheReadContext('catalog-search', undefined),
    page,
    pageSize,
    totalResultCount: undefined,
    returnedSqlRowCount: undefined,
    returnedCatalogRowCount: undefined,
    distinctExploreCount: undefined,
    selectedExploreJsonBytes: undefined,
});

/**
 * Runs the storage-size lookup best-effort: a failure here (including the
 * method being unavailable) must never break or slow the underlying
 * cached-explore read, so it is swallowed and reported as `undefined`.
 */
export const safeGetCachedExploreStorageBytes = async (
    getStorageBytes: () => Promise<number>,
): Promise<number | undefined> => {
    if (!isExploreCacheReadStorageBytesEnabled()) {
        return undefined;
    }

    try {
        return await getStorageBytes();
    } catch {
        return undefined;
    }
};

/**
 * Counts explores and their combined table fan-out from an already-fetched
 * cached-explore map. Only iterates keys already resident in memory - does
 * not re-serialize or otherwise re-read the underlying JSONB payload.
 */
export const summarizeExploreCacheRead = (
    explores: Record<
        string,
        | Explore
        | ExploreError
        | {
              isExploreError: boolean;
              tables: Record<string, unknown>;
          }
    >,
): Pick<ExploreCacheReadContext, 'exploreCount' | 'tableFanOut'> => {
    const values = Object.values(explores);
    const tableFanOut = values.reduce(
        (sum, explore) =>
            sum +
            ('isExploreError' in explore
                ? explore.isExploreError
                : isExploreError(explore)
            )
                ? 0
                : Object.keys(explore.tables).length,
        0,
    );
    return { exploreCount: values.length, tableFanOut };
};

export const summarizeCatalogSearchExploreRead = (
    returnedSqlRowCount: number,
    explores: Record<string, Explore>,
): Pick<
    CatalogSearchExploreCacheReadContext,
    | 'exploreCount'
    | 'tableFanOut'
    | 'returnedSqlRowCount'
    | 'distinctExploreCount'
    | 'selectedExploreJsonBytes'
> => ({
    ...summarizeExploreCacheRead(explores),
    returnedSqlRowCount,
    distinctExploreCount: Object.keys(explores).length,
    selectedExploreJsonBytes: Object.values(explores).reduce(
        (totalBytes, explore) =>
            totalBytes + Buffer.byteLength(JSON.stringify(explore), 'utf8'),
        0,
    ),
});
