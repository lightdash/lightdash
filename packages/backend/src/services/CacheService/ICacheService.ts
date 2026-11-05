import { LightdashUser, type QueryResultProducer } from '@lightdash/common';
import { CacheHitCacheResult, CacheLookupResult } from './types';

export type CacheServiceUser = Pick<
    LightdashUser,
    'userUuid' | 'organizationUuid' | 'organizationName'
>;

export interface ICacheService {
    findCachedResultsFile: (
        projectUuid: string,
        cacheKey: string,
        user: CacheServiceUser,
        requesterProducer?: QueryResultProducer | null,
        identityEnabled?: boolean,
    ) => Promise<CacheHitCacheResult | null>;
    lookupCachedResultsFile: (
        projectUuid: string,
        cacheKey: string,
        user: CacheServiceUser,
        requesterProducer?: QueryResultProducer | null,
        identityEnabled?: boolean,
    ) => Promise<CacheLookupResult>;
}
