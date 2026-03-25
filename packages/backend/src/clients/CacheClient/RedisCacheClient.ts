import Redis from 'ioredis';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { KeyValueCacheClient } from './ICacheClient';

type RedisConfig = NonNullable<LightdashConfig['redis']>;

export class RedisCacheClient implements KeyValueCacheClient {
    private readonly redis: Redis;

    private readonly defaultTtlSeconds: number;

    constructor(redisConfig: RedisConfig, defaultTtlSeconds: number = 30) {
        this.redis = new Redis(redisConfig.url);
        this.defaultTtlSeconds = defaultTtlSeconds;
        Logger.debug('RedisCacheClient initialized');
    }

    async get<T>(key: string): Promise<T | undefined> {
        const raw = await this.redis.get(key);
        if (raw === null) {
            return undefined;
        }
        try {
            Logger.debug(`Redis cache HIT for key "${key}"`);
            return JSON.parse(raw) as T;
        } catch (e) {
            Logger.warn(`Failed to parse cached value for key "${key}"`);
            return undefined;
        }
    }

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const ttl = ttlSeconds ?? this.defaultTtlSeconds;
        await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
        Logger.debug(`Redis cache SET key "${key}" with TTL ${ttl}s`);
    }

    async del(key: string): Promise<void> {
        await this.redis.del(key);
        Logger.debug(`Redis cache DEL key "${key}"`);
    }

    async delByPrefix(prefix: string): Promise<void> {
        Logger.debug(`Redis cache DEL by prefix "${prefix}"`);
        // Use SCAN instead of KEYS for production safety
        const scanAndDelete = async (cursor: string): Promise<void> => {
            const [nextCursor, keys] = await this.redis.scan(
                cursor,
                'MATCH',
                `${prefix}*`,
                'COUNT',
                100,
            );
            if (keys.length > 0) {
                await this.redis.del(...keys);
                Logger.debug(
                    `Redis cache DEL ${keys.length} keys matching "${prefix}*"`,
                );
            }
            if (nextCursor !== '0') {
                return scanAndDelete(nextCursor);
            }
            return undefined;
        };
        return scanAndDelete('0');
    }
}
