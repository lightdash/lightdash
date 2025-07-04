import { CacheHitCacheResult } from './types';

export interface ICacheService {
    isEnabled: boolean;
    findCachedResultsFile: (
        projectUuid: string,
        cacheKey: string,
    ) => Promise<CacheHitCacheResult | null>;
}
