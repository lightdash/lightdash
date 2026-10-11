export const CACHE_TTL_SECONDS = 30;
const MIN_CACHE_TTL_SECONDS = 5;

export type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

export const createCacheEntry = <T>(
    value: T,
    startedAt: number,
): CacheEntry<T> | null => {
    const now = Date.now();
    const expiresAt = Math.max(
        Math.min(startedAt, now) + CACHE_TTL_SECONDS * 1000,
        now + MIN_CACHE_TTL_SECONDS * 1000,
    );
    if (!(now < expiresAt)) return null;
    return { value, expiresAt };
};

export const readCacheEntry = <T>(
    entry: CacheEntry<T> | undefined,
): T | undefined =>
    entry && Date.now() < entry.expiresAt ? entry.value : undefined;
