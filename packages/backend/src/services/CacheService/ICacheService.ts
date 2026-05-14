import { LightdashUser } from '@lightdash/common';
import { CacheHitCacheResult } from './types';

export type CacheServiceUser = Pick<
    LightdashUser,
    'userUuid' | 'organizationUuid' | 'organizationName'
>;

export interface ICacheService {
    /**
     * Resolve whether results caching is enabled for the given user/org. The
     * implementation reads the ResultsCacheEnabled feature flag (DB value
     * with env fallback). Pass `undefined` for callers that don't have a
     * user (rare — e.g. background jobs) — only the env fallback applies.
     */
    isResultsCacheEnabled: (
        user: CacheServiceUser | undefined,
    ) => Promise<boolean>;
    findCachedResultsFile: (
        projectUuid: string,
        cacheKey: string,
        user: CacheServiceUser,
    ) => Promise<CacheHitCacheResult | null>;
}
