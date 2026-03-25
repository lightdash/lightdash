import NodeCache from 'node-cache';
import Logger from '../../logging/logger';
import { KeyValueCacheClient } from './ICacheClient';

export class InMemoryCacheClient implements KeyValueCacheClient {
    private readonly cache: NodeCache;

    constructor(defaultTtlSeconds: number = 30) {
        this.cache = new NodeCache({
            stdTTL: defaultTtlSeconds,
            checkperiod: 60,
        });
        Logger.debug('InMemoryCacheClient initialized');
    }

    async get<T>(key: string): Promise<T | undefined> {
        const value = this.cache.get<T>(key);
        if (value !== undefined) {
            Logger.debug(`InMemory cache HIT for key "${key}"`);
        }
        return value;
    }

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds !== undefined) {
            this.cache.set(key, value, ttlSeconds);
        } else {
            this.cache.set(key, value);
        }
    }

    async del(key: string): Promise<void> {
        this.cache.del(key);
    }

    async delByPrefix(prefix: string): Promise<void> {
        const keys = this.cache.keys().filter((k) => k.startsWith(prefix));
        if (keys.length > 0) {
            this.cache.del(keys);
        }
    }
}
