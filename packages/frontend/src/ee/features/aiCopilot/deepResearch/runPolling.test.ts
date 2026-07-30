import { describe, expect, it } from 'vitest';
import {
    DEEP_RESEARCH_TERMINAL_REFETCH_MAX_MS,
    getDeepResearchRunRefetchInterval,
} from './runPolling';

const now = Date.parse('2026-07-30T12:00:00.000Z');

describe('getDeepResearchRunRefetchInterval', () => {
    it('keeps active runs on the normal polling interval', () => {
        expect(
            getDeepResearchRunRefetchInterval(
                {
                    status: 'running',
                    isReportExpired: false,
                    reportExpiresAt: null,
                },
                2_000,
                now,
            ),
        ).toBe(2_000);
    });

    it('refetches a terminal run at its expiry boundary', () => {
        expect(
            getDeepResearchRunRefetchInterval(
                {
                    status: 'completed',
                    isReportExpired: false,
                    reportExpiresAt: '2026-07-30T12:05:00.000Z',
                },
                2_000,
                now,
            ),
        ).toBe(5 * 60 * 1_000);
    });

    it('caps long waits and stops after the report expires', () => {
        expect(
            getDeepResearchRunRefetchInterval(
                {
                    status: 'completed',
                    isReportExpired: false,
                    reportExpiresAt: '2026-08-29T12:00:00.000Z',
                },
                2_000,
                now,
            ),
        ).toBe(DEEP_RESEARCH_TERMINAL_REFETCH_MAX_MS);
        expect(
            getDeepResearchRunRefetchInterval(
                {
                    status: 'completed',
                    isReportExpired: true,
                    reportExpiresAt: '2026-07-30T12:00:00.000Z',
                },
                2_000,
                now,
            ),
        ).toBe(false);
    });
});
