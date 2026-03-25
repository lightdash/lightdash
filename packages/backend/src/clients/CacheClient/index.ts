import { LightdashConfig } from '../../config/parseConfig';
import type { KeyValueCacheClient } from './ICacheClient';
import { InMemoryCacheClient } from './InMemoryCacheClient';
import { RedisCacheClient } from './RedisCacheClient';

export type { KeyValueCacheClient } from './ICacheClient';

export function createCacheClient(
    redisConfig: LightdashConfig['redis'],
): KeyValueCacheClient | undefined {
    if (redisConfig) {
        return new RedisCacheClient(redisConfig);
    }
    if (process.env.EXPERIMENTAL_CACHE === 'true') {
        return new InMemoryCacheClient();
    }
    return undefined;
}
