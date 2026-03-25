import { Explore, ExploreError } from '@lightdash/common';
import NodeCache from 'node-cache';
import { KeyValueCacheClient } from '../../clients/CacheClient';

type CachedExplores = Record<string, Explore | ExploreError>;

export class ExploreCache {
    private readonly cache: NodeCache | undefined;

    private readonly keyValueCacheClient: KeyValueCacheClient | undefined;

    constructor(keyValueCacheClient?: KeyValueCacheClient) {
        // Initialize in-memory cache with 30 seconds TTL
        this.cache =
            process.env.EXPERIMENTAL_CACHE === 'true'
                ? new NodeCache({
                      stdTTL: 30, // time to live in seconds
                      checkperiod: 60, // cleanup interval in seconds
                  })
                : undefined;
        this.keyValueCacheClient = keyValueCacheClient;
    }

    private static getCacheKey(
        projectUuid: string,
        exploreNames: string[] | undefined,
        changesetUpdatedAt: Date | undefined,
    ): string {
        const exploreNamesString = exploreNames?.join(',') || 'all';

        const cacheKey = changesetUpdatedAt
            ? `project:${projectUuid}:explores:${exploreNamesString}:${changesetUpdatedAt.toISOString()}`
            : `project:${projectUuid}:explores:${exploreNamesString}`;

        return cacheKey;
    }

    public async getExplores(
        projectUuid: string,
        exploreNames: string[] | undefined,
        changesetUpdatedAt: Date | undefined,
    ): Promise<CachedExplores | undefined> {
        const cacheKey = ExploreCache.getCacheKey(
            projectUuid,
            exploreNames,
            changesetUpdatedAt,
        );

        // Try key-value cache first (if available)
        if (this.keyValueCacheClient) {
            const kvCached =
                await this.keyValueCacheClient.get<CachedExplores>(cacheKey);
            if (kvCached) {
                return kvCached;
            }
        }

        // Fall back to in-memory NodeCache
        return this.cache?.get<CachedExplores>(cacheKey);
    }

    public async setExplores(
        projectUuid: string,
        exploreNames: string[] | undefined,
        changesetUpdatedAt: Date | undefined,
        explore: CachedExplores,
    ): Promise<void> {
        const cacheKey = ExploreCache.getCacheKey(
            projectUuid,
            exploreNames,
            changesetUpdatedAt,
        );

        // Store in both caches
        this.cache?.set(cacheKey, explore);
        await this.keyValueCacheClient?.set(cacheKey, explore, 30);
    }
}
