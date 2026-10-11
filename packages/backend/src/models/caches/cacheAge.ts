export const CACHE_TTL_SECONDS = 30;

export type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

export const createCacheEntry = <T>(
    value: T,
    startedAt: number,
): CacheEntry<T> | null => {
    const expiresAt =
        Math.min(startedAt, Date.now()) + CACHE_TTL_SECONDS * 1000;
    if (!(Date.now() < expiresAt)) return null;
    return { value, expiresAt };
};

export const readCacheEntry = <T>(
    entry: CacheEntry<T> | undefined,
): T | undefined =>
    entry && Date.now() < entry.expiresAt ? entry.value : undefined;
