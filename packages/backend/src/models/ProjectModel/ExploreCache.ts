import { Explore, ExploreError } from '@lightdash/common';
import NodeCache from 'node-cache';

type CachedExplores = Record<string, Explore | ExploreError>;

export class ExploreCache {
    private readonly cache: NodeCache | undefined;

    constructor() {
        // Initialize cache with 30 seconds TTL
        this.cache =
            process.env.EXPERIMENTAL_CACHE === 'true'
                ? new NodeCache({
                      stdTTL: 30, // time to live in seconds
                      checkperiod: 60, // cleanup interval in seconds
                  })
                : undefined;
    }

    private static getCacheKey(
        projectUuid: string,
        exploreNames: string[] | undefined,
        changesetUpdatedAt: Date | undefined,
    ): string {
        const exploreNamesString = exploreNames?.join(',') || 'all';

        const cacheKey = changesetUpdatedAt
            ? `explores::${projectUuid}::${exploreNamesString}::${changesetUpdatedAt.toISOString()}`
            : `explores::${projectUuid}::${exploreNamesString}`;

        return cacheKey;
    }

    public getExplores(
        projectUuid: string,
        exploreNames: string[] | undefined,
        changesetUpdatedAt: Date | undefined,
    ): CachedExplores | undefined {
        return this.cache?.get<CachedExplores>(
            ExploreCache.getCacheKey(
                projectUuid,
                exploreNames,
                changesetUpdatedAt,
            ),
        );
    }

    public setExplores(
        projectUuid: string,
        exploreNames: string[] | undefined,
        changesetUpdatedAt: Date | undefined,
        explore: CachedExplores,
    ): void {
        this.cache?.set(
            ExploreCache.getCacheKey(
                projectUuid,
                exploreNames,
                changesetUpdatedAt,
            ),
            explore,
        );
    }
}
