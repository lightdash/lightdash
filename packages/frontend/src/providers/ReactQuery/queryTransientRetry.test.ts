import { type ApiError, type HealthState } from '@lightdash/common';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stampServerError } from '../../api';
import {
    defaultQueryRetry,
    defaultQueryRetryDelay,
    isRetryableTransientApiError,
} from './queryTransientRetry';

const buildApiError = (
    statusCode: number,
    name = 'Error',
    message = 'simulated',
): ApiError =>
    stampServerError({
        status: 'error',
        error: { name, statusCode, message, data: {} },
    });

const buildUnmarkedApiError = (
    statusCode: number,
    name = 'Error',
    message = 'simulated',
): ApiError => ({
    status: 'error',
    error: { name, statusCode, message, data: {} },
});

const buildQueryClientWithHealth = (
    retryQueryOnTransientErrors: boolean | undefined,
): QueryClient => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    if (retryQueryOnTransientErrors !== undefined) {
        queryClient.setQueryData<Partial<HealthState>>(['health'], {
            query: {
                retryQueryOnTransientErrors,
                // Other HealthState.query fields are not read by defaultQueryRetry.
            } as HealthState['query'],
        });
    }
    return queryClient;
};

describe('isRetryableTransientApiError', () => {
    it('returns false for non-object inputs', () => {
        expect(isRetryableTransientApiError(null)).toBe(false);
        expect(isRetryableTransientApiError(undefined)).toBe(false);
        expect(isRetryableTransientApiError('boom')).toBe(false);
        expect(isRetryableTransientApiError(503)).toBe(false);
        expect(isRetryableTransientApiError(true)).toBe(false);
    });

    it('returns false for runtime errors thrown from queryFn / select', () => {
        expect(isRetryableTransientApiError(new TypeError('nope'))).toBe(false);
        expect(isRetryableTransientApiError(new Error('boom'))).toBe(false);
        expect(isRetryableTransientApiError({})).toBe(false);
        expect(isRetryableTransientApiError({ foo: 'bar' })).toBe(false);
    });

    it('returns true for ApiError with NetworkError name', () => {
        expect(
            isRetryableTransientApiError(buildApiError(0, 'NetworkError')),
        ).toBe(true);
        // NetworkError takes precedence even when statusCode is 4xx.
        expect(
            isRetryableTransientApiError(buildApiError(401, 'NetworkError')),
        ).toBe(true);
    });

    it('returns true for ApiError with 5xx statusCode', () => {
        expect(isRetryableTransientApiError(buildApiError(500))).toBe(true);
        expect(isRetryableTransientApiError(buildApiError(502))).toBe(true);
        expect(isRetryableTransientApiError(buildApiError(503))).toBe(true);
        expect(isRetryableTransientApiError(buildApiError(504))).toBe(true);
        expect(isRetryableTransientApiError(buildApiError(599))).toBe(true);
    });

    it('returns false for ApiError with 4xx statusCode', () => {
        expect(isRetryableTransientApiError(buildApiError(400))).toBe(false);
        expect(isRetryableTransientApiError(buildApiError(401))).toBe(false);
        expect(isRetryableTransientApiError(buildApiError(403))).toBe(false);
        expect(isRetryableTransientApiError(buildApiError(404))).toBe(false);
        expect(isRetryableTransientApiError(buildApiError(422))).toBe(false);
        expect(isRetryableTransientApiError(buildApiError(499))).toBe(false);
    });

    it('returns false for ApiError with 2xx/3xx statusCode (defensive)', () => {
        expect(isRetryableTransientApiError(buildApiError(200))).toBe(false);
        expect(isRetryableTransientApiError(buildApiError(301))).toBe(false);
    });
});

describe('SERVER_ERROR_MARKER contract', () => {
    it('rejects unmarked errors regardless of shape', () => {
        // Same shapes that would retry if marked — without the marker, none do.
        expect(
            isRetryableTransientApiError(
                buildUnmarkedApiError(503, 'NetworkError'),
            ),
        ).toBe(false);
        expect(isRetryableTransientApiError(buildUnmarkedApiError(500))).toBe(
            false,
        );
        expect(isRetryableTransientApiError(buildUnmarkedApiError(502))).toBe(
            false,
        );
    });

    it('accepts marked errors only when the shape is also transient', () => {
        expect(isRetryableTransientApiError(buildApiError(503))).toBe(true);
        expect(
            isRetryableTransientApiError(buildApiError(0, 'NetworkError')),
        ).toBe(true);
        // Marker does not override the 4xx rule — provenance + shape both required.
        expect(isRetryableTransientApiError(buildApiError(404))).toBe(false);
    });

    it('survives spread and Object.assign so wrapped errors stay retryable', () => {
        const original = buildApiError(503);
        // Common patterns for "wrap an error with extra context" — both must
        // preserve retry eligibility, otherwise wrapping silently disables retry.
        expect(isRetryableTransientApiError({ ...original })).toBe(true);
        expect(isRetryableTransientApiError(Object.assign({}, original))).toBe(
            true,
        );
    });

    it('rejects synthetic 5xx thrown from queryFn bodies (regression)', () => {
        // Mirrors the exact shape thrown by useUnderlyingDataResults /
        // useQueryResults for warehouse CANCELLED / ERROR / EXPIRED, and by
        // useSavedSqlChartResults's defensive catch wrapping a processing
        // exception. These must not retry — the user has already waited and
        // the underlying failure is non-transient.
        const cancelledQuery: ApiError = {
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 500,
                message: 'Query cancelled',
                data: {},
            },
        };
        const expiredQuery: ApiError = {
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 500,
                message: 'Query failed',
                data: {},
            },
        };
        const wrappedProcessingError: ApiError = {
            status: 'error',
            error: {
                name: 'ChartResultsError',
                statusCode: 500,
                message: 'Cannot read properties of undefined',
                data: {},
            },
        };

        expect(isRetryableTransientApiError(cancelledQuery)).toBe(false);
        expect(isRetryableTransientApiError(expiredQuery)).toBe(false);
        expect(isRetryableTransientApiError(wrappedProcessingError)).toBe(
            false,
        );
    });
});

describe('defaultQueryRetry', () => {
    it('returns true on transient error when health is unavailable (early-load window)', () => {
        const queryClient = buildQueryClientWithHealth(undefined);
        expect(defaultQueryRetry(queryClient, 0, buildApiError(503))).toBe(
            true,
        );
        expect(
            defaultQueryRetry(queryClient, 0, buildApiError(0, 'NetworkError')),
        ).toBe(true);
    });

    it('returns false on non-transient error when health is unavailable', () => {
        const queryClient = buildQueryClientWithHealth(undefined);
        expect(defaultQueryRetry(queryClient, 0, buildApiError(404))).toBe(
            false,
        );
        expect(defaultQueryRetry(queryClient, 0, new TypeError('boom'))).toBe(
            false,
        );
    });

    it('returns false when health flag is disabled', () => {
        const queryClient = buildQueryClientWithHealth(false);
        expect(defaultQueryRetry(queryClient, 0, buildApiError(503))).toBe(
            false,
        );
    });

    it('returns false when health is loaded but retry flag is missing', () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        queryClient.setQueryData<Partial<HealthState>>(['health'], {
            query: {} as HealthState['query'],
        });
        expect(defaultQueryRetry(queryClient, 0, buildApiError(503))).toBe(
            false,
        );
    });

    it('returns true on transient error when health flag is enabled', () => {
        const queryClient = buildQueryClientWithHealth(true);
        expect(defaultQueryRetry(queryClient, 0, buildApiError(503))).toBe(
            true,
        );
        expect(
            defaultQueryRetry(queryClient, 0, buildApiError(0, 'NetworkError')),
        ).toBe(true);
    });

    it('returns false on non-transient error even when flag is enabled', () => {
        const queryClient = buildQueryClientWithHealth(true);
        expect(defaultQueryRetry(queryClient, 0, buildApiError(404))).toBe(
            false,
        );
        expect(defaultQueryRetry(queryClient, 0, new TypeError('bug'))).toBe(
            false,
        );
    });

    it('caps retries after MAX_RETRIES (3) attempts', () => {
        const queryClient = buildQueryClientWithHealth(true);
        const error = buildApiError(503);
        expect(defaultQueryRetry(queryClient, 0, error)).toBe(true);
        expect(defaultQueryRetry(queryClient, 1, error)).toBe(true);
        expect(defaultQueryRetry(queryClient, 2, error)).toBe(true);
        expect(defaultQueryRetry(queryClient, 3, error)).toBe(false);
        expect(defaultQueryRetry(queryClient, 99, error)).toBe(false);
    });
});

describe('defaultQueryRetry — navigator.onLine gating', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('skips retry when navigator.onLine is false', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const queryClient = buildQueryClientWithHealth(true);
        // Even a textbook-retryable 503 must not retry while the browser
        // reports offline — refetchOnReconnect will pick it up on `online`.
        expect(defaultQueryRetry(queryClient, 0, buildApiError(503))).toBe(
            false,
        );
    });

    it('retries normally when navigator.onLine is true', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        const queryClient = buildQueryClientWithHealth(true);
        expect(defaultQueryRetry(queryClient, 0, buildApiError(503))).toBe(
            true,
        );
    });
});

describe('defaultQueryRetryDelay', () => {
    it('falls in [base, 2*base) for each attempt index', () => {
        const samples = 200;
        const ranges: Array<[number, number]> = [
            [4_000, 8_000], // attempt 0
            [8_000, 16_000], // attempt 1
            [16_000, 32_000], // attempt 2
        ];

        ranges.forEach(([min, max], attempt) => {
            for (let i = 0; i < samples; i += 1) {
                const delay = defaultQueryRetryDelay(attempt);
                expect(delay).toBeGreaterThanOrEqual(min);
                expect(delay).toBeLessThan(max);
            }
        });
    });
});
