import { LightdashUser, type QueryResultProducer } from '@lightdash/common';
import { CacheLookupResult } from './types';

export type CacheServiceUser = Pick<
    LightdashUser,
    'userUuid' | 'organizationUuid' | 'organizationName'
>;

export interface ICacheService {
    lookupCachedResultsFile: (
        projectUuid: string,
        cacheKey: string,
        user: CacheServiceUser,
        requesterProducer?: QueryResultProducer | null,
        identityEnabled?: boolean,
    ) => Promise<CacheLookupResult>;
}
