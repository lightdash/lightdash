import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useMemo } from 'react';

/**
 * Static cache key prefix. The number value can be incremented
 * to invalidate previous cache entries.
 *
 * Represented as a tuple so that we can use the prefix and version
 * separately (e.g to find other cache entries by cache key):
 */
const stateCacheKeyPrefix: [string, number] = ['ld-state', 1];

interface StateCacheData<CacheDataT> {
    expireAt: number;
    value: CacheDataT;
}

/**
 * Generates a short, URL-friendly state cache hash-key, out of two
 * v4 UUID segments.
 */
export const generateStateCacheKey = () => {
    return crypto.randomUUID().split('-').slice(0, 2).join();
};

/**
 * Runs through localStorage and removes expired state cache entries, using
 * the namespace portion of `stateCacheKeyPrefix`.
 *
 * Returns a list of keys that were removed.
 */
const cleanupExpiredStateCacheData = (): string[] => {
    const tsNow = Date.now();
    return Object.keys(localStorage).filter((keyName) => {
        if (!keyName.startsWith(stateCacheKeyPrefix[0])) {
            return false;
        }

        const item = localStorage.getItem(keyName);
        if (!item) return;
        try {
            const cacheData = JSON.parse(item) as StateCacheData<unknown>;

            if (tsNow > cacheData.expireAt) {
                localStorage.removeItem(keyName);
                return true;
            }
        } catch (_e) {
            // Do nothing
        }

        return false;
    });
};

/**
 * Wrapper around mantine's `useLocalStorage` specifically for state caching, with
 * support for lazy cache expiration.
 *
 * Note that multiple tabs using the same cache key will share cache data - this
 * is cool and useful, but may also have unintended side-effects you have to
 * account for.
 *
 * const [myStateData, setMyStateData] = useStateCache<StateDataT>(generateStateCacheKey(), {
 *   initialData: myData // StateDataT
 * });
 *
 * setMyStateData({ ...myStateData, someNewValue: 'foo' });
 */
export const useStateCache = <CacheDataT>(
    /**
     * Unique identifier for a state cache. Should be reasonably unique, like
     * a UUID, but can also be a partial UUID if we treat state caches as
     * particularly volatile and short-lived.
     */
    hashKey: string,
    {
        /* The initial data to be cached; goes directly into local storage */
        initialData,

        /* A value in minutes after which this state cache is eligible for deletion. */
        expireAfterMinutes = 1440, // 24 hours
    }: {
        initialData: CacheDataT;
        expireAfterMinutes?: number;
    },
) => {
    const fullKey = useMemo(
        () => `${stateCacheKeyPrefix.join('-')}/${hashKey}`,
        [hashKey],
    );

    /**
     * Ensures data going into localStorage is properly formatted, including
     * an expiry timestamp.
     */
    const createCacheEntry = useCallback(
        (data: CacheDataT): StateCacheData<CacheDataT> => ({
            expireAt: Date.now() + expireAfterMinutes * 60000, // minutes -> ms
            value: data,
        }),
        [expireAfterMinutes],
    );

    const [cacheData, setCacheDataInLocalStorage] = useLocalStorage<
        StateCacheData<CacheDataT>
    >({
        key: fullKey,
        defaultValue: createCacheEntry(initialData),
    });

    /**
     * Thin wrapper around mantine's local storage setter which calls
     * createCacheEntry on the data first, and runs the cache cleanup
     * process.
     */
    const setCacheData = useCallback(
        (data: CacheDataT) => {
            setCacheDataInLocalStorage(createCacheEntry(data));

            /**
             * Push this task into a future loop since it's not critical
             * nor tied to render state:
             */
            setTimeout(() => cleanupExpiredStateCacheData(), 0);
        },
        [setCacheDataInLocalStorage, createCacheEntry],
    );

    /**
     * Deletes the underlying local storage entry. Using `setCacheData` with
     * the same key at this point will, as you'd expect, recreate the entry.
     */
    const clearCacheData = useCallback(() => {
        localStorage.removeItem(fullKey);
    }, [fullKey]);

    return [
        cacheData.value,
        setCacheData,

        /**
         * Contains metadata that is probably not usually useful to the caller:
         */
        {
            expireAt: cacheData.expireAt,
            clearCacheData,
        },
    ] as const;
};
