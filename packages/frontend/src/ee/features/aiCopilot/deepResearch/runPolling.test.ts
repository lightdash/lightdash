import { type ApiError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    DEEP_RESEARCH_TERMINAL_REFETCH_MAX_MS,
    getDeepResearchRunRefetchInterval,
} from './runPolling';

const apiError = (statusCode: number): ApiError =>
    ({
        error: { statusCode, name: 'ApiError', message: 'failed', data: {} },
        status: 'error',
    }) as ApiError;

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

    it.each([403, 404])('stops polling after a %s response', (statusCode) => {
        expect(
            getDeepResearchRunRefetchInterval(undefined, 2_000, now, {
                error: apiError(statusCode),
                failureCount: 1,
            }),
        ).toBe(false);
    });

    it('backs off transient polling failures with a cap', () => {
        expect(
            getDeepResearchRunRefetchInterval(undefined, 2_000, now, {
                error: apiError(500),
                failureCount: 2,
            }),
        ).toBe(8_000);
        expect(
            getDeepResearchRunRefetchInterval(undefined, 2_000, now, {
                error: apiError(500),
                failureCount: 20,
            }),
        ).toBe(30_000);
    });

    it('backs off transient failures even when a terminal run is cached', () => {
        expect(
            getDeepResearchRunRefetchInterval(
                {
                    status: 'completed',
                    isReportExpired: false,
                    reportExpiresAt: '2026-08-29T12:00:00.000Z',
                },
                2_000,
                now,
                {
                    error: apiError(500),
                    failureCount: 2,
                },
            ),
        ).toBe(8_000);
    });
});
