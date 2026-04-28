import { PersonalAccessToken, SessionUser } from '@lightdash/common';
import * as crypto from 'crypto';
import NodeCache from 'node-cache';

export type CachedPatSessionUser = {
    user: SessionUser;
    personalAccessToken: PersonalAccessToken;
};

const cache =
    process.env.EXPERIMENTAL_CACHE === 'true'
        ? new NodeCache({
              stdTTL: 30, // time to live in seconds
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
        return cache?.get<CachedPatSessionUser>(genKey(token));
    },
    set(token: string, value: CachedPatSessionUser): void {
        cache?.set(genKey(token), value);
    },
    invalidate(): void {
        cache?.flushAll();
    },
};
