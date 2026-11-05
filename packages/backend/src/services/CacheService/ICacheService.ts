import { LightdashUser, type QueryResultProducer } from '@lightdash/common';
import { CacheHitCacheResult } from './types';

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
}
