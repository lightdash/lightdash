import { CacheHitCacheResult } from './types';

export interface ICacheService {
    findCachedResultsFile: (
        projectUuid: string,
        cacheKey: string,
    ) => Promise<CacheHitCacheResult | null>;
}
