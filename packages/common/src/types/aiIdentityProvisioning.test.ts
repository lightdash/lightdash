import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAiIdentitySetupCheckInterval } from './aiIdentityProvisioning';

describe('setup check schedule', () => {
    const start = '2026-10-06T10:00:00.000Z';
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(start));
    });
    afterEach(() => vi.useRealTimers());
    it('checks every ten seconds for fifteen minutes', () => {
        expect(getAiIdentitySetupCheckInterval(start)).toBe(10_000);
        vi.advanceTimersByTime(15 * 60_000 - 1);
        expect(getAiIdentitySetupCheckInterval(start)).toBe(10_000);
    });
    it('checks every sixty seconds after fifteen minutes', () => {
        vi.advanceTimersByTime(15 * 60_000);
        expect(getAiIdentitySetupCheckInterval(start)).toBe(60_000);
    });
    it('stops at two hours', () => {
        vi.advanceTimersByTime(2 * 60 * 60_000);
        expect(getAiIdentitySetupCheckInterval(start)).toBe(false);
    });
    it('does not poll without a valid start time', () => {
        expect(getAiIdentitySetupCheckInterval(null)).toBe(false);
        expect(getAiIdentitySetupCheckInterval('invalid')).toBe(false);
    });
});
