import { FeatureFlags } from '@lightdash/common';
import {
    cachedUsageCaptureEligibility,
    USAGE_CAPTURE_FLAG_TTL_MS,
} from './createEventStreamWriter';

describe('cached usage capture eligibility', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('coalesces concurrent checks by organization and refreshes off/on changes', async () => {
        vi.useFakeTimers();
        const states = new Map([
            ['org-a', true],
            ['org-b', false],
        ]);
        const get = vi.fn(async ({ user }) => ({
            id: FeatureFlags.AnalyticsProject,
            enabled: states.get(user.organizationUuid) ?? false,
        }));
        const allowed = cachedUsageCaptureEligibility(() => ({ get }));
        expect(
            await Promise.all(
                Array.from({ length: 1000 }, () => allowed('org-a')),
            ),
        ).toEqual(Array(1000).fill(true));
        expect(await allowed('org-b')).toBe(false);
        expect(get).toHaveBeenCalledTimes(2);
        states.set('org-a', false);
        states.set('org-b', true);
        expect(await allowed('org-a')).toBe(true);
        vi.advanceTimersByTime(USAGE_CAPTURE_FLAG_TTL_MS);
        expect(await allowed('org-a')).toBe(false);
        expect(await allowed('org-b')).toBe(true);
        expect(get).toHaveBeenCalledTimes(4);
    });

    it('fails closed and caches failures without throwing into the caller', async () => {
        vi.useFakeTimers();
        const get = vi.fn().mockRejectedValue(new Error('unavailable'));
        const allowed = cachedUsageCaptureEligibility(() => ({ get }));
        expect(await allowed('org')).toBe(false);
        expect(await allowed('org')).toBe(false);
        expect(get).toHaveBeenCalledTimes(1);
        get.mockResolvedValue({
            id: FeatureFlags.AnalyticsProject,
            enabled: true,
        });
        vi.advanceTimersByTime(USAGE_CAPTURE_FLAG_TTL_MS);
        expect(await allowed('org')).toBe(true);
    });

    it('bounds inactive organization entries', async () => {
        const get = vi.fn(async () => ({
            id: FeatureFlags.AnalyticsProject,
            enabled: false,
        }));
        const allowed = cachedUsageCaptureEligibility(() => ({ get }));
        for (let index = 0; index < 1001; index += 1)
            // eslint-disable-next-line no-await-in-loop -- Exercise eviction in a deterministic order.
            await allowed(`org-${index}`);
        await allowed('org-0');
        expect(get).toHaveBeenCalledTimes(1002);
    });
});
