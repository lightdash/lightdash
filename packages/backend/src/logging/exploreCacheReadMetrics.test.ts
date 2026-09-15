import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeGetCachedExploreStorageBytes } from './exploreCacheReadMetrics';

describe('safeGetCachedExploreStorageBytes', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('does not run the storage query when disabled', async () => {
        vi.stubEnv('LIGHTDASH_EXPLORE_CACHE_READ_STORAGE_BYTES', 'false');
        const getStorageBytes = vi.fn(async () => 42);

        await expect(
            safeGetCachedExploreStorageBytes(getStorageBytes),
        ).resolves.toBeUndefined();

        expect(getStorageBytes).not.toHaveBeenCalled();
    });

    it('runs the storage query by default', async () => {
        vi.stubEnv('LIGHTDASH_EXPLORE_CACHE_READ_STORAGE_BYTES', undefined);
        const getStorageBytes = vi.fn(async () => 42);

        await expect(
            safeGetCachedExploreStorageBytes(getStorageBytes),
        ).resolves.toBe(42);

        expect(getStorageBytes).toHaveBeenCalledOnce();
    });
});
