import { CacheHitCacheResult } from './types';

export interface ICacheService {
    findCachedResultsFile: (
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
    ) => Promise<CacheHitCacheResult | null>;
}
