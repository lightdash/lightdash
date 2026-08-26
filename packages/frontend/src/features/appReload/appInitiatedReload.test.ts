import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const APP_INITIATED_RELOAD_KEY = 'lightdash-app-initiated-reload';

const importModule = async () => import('./appInitiatedReload');

describe('appInitiatedReload', () => {
    beforeEach(() => {
        vi.resetModules();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns false when no marker was set', async () => {
        const { wasAppInitiatedReload } = await importModule();
        expect(wasAppInitiatedReload()).toBe(false);
    });

    it('returns true after marking, consumes the marker, and caches the result', async () => {
        const { markAppInitiatedReload, wasAppInitiatedReload } =
            await importModule();

        markAppInitiatedReload();
        expect(sessionStorage.getItem(APP_INITIATED_RELOAD_KEY)).not.toBeNull();

        expect(wasAppInitiatedReload()).toBe(true);
        expect(sessionStorage.getItem(APP_INITIATED_RELOAD_KEY)).toBeNull();

        // Cached for repeat callers within the same page load
        expect(wasAppInitiatedReload()).toBe(true);
    });

    it('returns false when the marker is stale', async () => {
        vi.useFakeTimers();
        const { markAppInitiatedReload, wasAppInitiatedReload } =
            await importModule();

        markAppInitiatedReload();
        vi.advanceTimersByTime(61_000);

        expect(wasAppInitiatedReload()).toBe(false);
    });

    it('returns false for a garbage marker value', async () => {
        sessionStorage.setItem(APP_INITIATED_RELOAD_KEY, 'not-a-timestamp');
        const { wasAppInitiatedReload } = await importModule();
        expect(wasAppInitiatedReload()).toBe(false);
    });
});
