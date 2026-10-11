import { PersonalAccessToken, SessionUser } from '@lightdash/common';
import * as crypto from 'crypto';
import NodeCache from 'node-cache';
import {
    CACHE_TTL_SECONDS,
    createCacheEntry,
    readCacheEntry,
    type CacheEntry,
} from './cacheAge';

export type CachedPatSessionUser = {
    user: SessionUser;
    personalAccessToken: PersonalAccessToken;
};

const cache =
    process.env.EXPERIMENTAL_CACHE === 'true'
        ? new NodeCache({
              stdTTL: CACHE_TTL_SECONDS, // time to live in seconds
              checkperiod: 60, // cleanup interval in seconds
          })
        : undefined;

const genKey = (token: string): string =>
    crypto
        .createHash('sha256')
        .update(`${process.env.LIGHTDASH_SECRET}:${token}`)
        .digest('hex');

export const PatSessionCache = {
    get(token: string): CachedPatSessionUser | undefined {
        return readCacheEntry(
            cache?.get<CacheEntry<CachedPatSessionUser>>(genKey(token)),
        );
    },
    set(token: string, value: CachedPatSessionUser, startedAt: number): void {
        if (!cache) return;
        const entry = createCacheEntry(value, startedAt);
        if (entry === null) return;
        cache.set(genKey(token), entry);
    },
    invalidate(): void {
        cache?.flushAll();
    },
};
