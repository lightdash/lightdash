import { Explore, ExploreError } from '@lightdash/common';
import { KeyValueCacheClient } from '../../clients/CacheClient';

type CachedExplores = Record<string, Explore | ExploreError>;

export class ExploreCache {
    private readonly keyValueCacheClient: KeyValueCacheClient | undefined;

    constructor(keyValueCacheClient?: KeyValueCacheClient) {
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

        return this.keyValueCacheClient?.get<CachedExplores>(cacheKey);
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

        await this.keyValueCacheClient?.set(cacheKey, explore, 30);
    }
}
