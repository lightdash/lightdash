import { type ApiError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDeepResearchRunRefetchInterval } from './runPolling';

const apiError = (statusCode: number): ApiError =>
    ({
        error: { statusCode, name: 'ApiError', message: 'failed', data: {} },
        status: 'error',
    }) as ApiError;

describe('getDeepResearchRunRefetchInterval', () => {
    it('keeps active runs on the normal polling interval', () => {
        expect(
            getDeepResearchRunRefetchInterval({ status: 'running' }, 2_000),
        ).toBe(2_000);
    });

    it('stops polling a terminal run', () => {
        expect(
            getDeepResearchRunRefetchInterval({ status: 'completed' }, 2_000),
        ).toBe(false);
    });

    it.each([403, 404])('stops polling after a %s response', (statusCode) => {
        expect(
            getDeepResearchRunRefetchInterval(undefined, 2_000, {
                error: apiError(statusCode),
                failureCount: 1,
            }),
        ).toBe(false);
    });

    it('backs off transient polling failures with a cap', () => {
        expect(
            getDeepResearchRunRefetchInterval(undefined, 2_000, {
                error: apiError(500),
                failureCount: 2,
            }),
        ).toBe(8_000);
        expect(
            getDeepResearchRunRefetchInterval(undefined, 2_000, {
                error: apiError(500),
                failureCount: 20,
            }),
        ).toBe(30_000);
    });

    it('backs off transient failures even when a terminal run is cached', () => {
        expect(
            getDeepResearchRunRefetchInterval({ status: 'completed' }, 2_000, {
                error: apiError(500),
                failureCount: 2,
            }),
        ).toBe(8_000);
    });
});
