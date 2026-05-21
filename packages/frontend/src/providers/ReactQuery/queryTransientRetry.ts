import type { ApiError, HealthState } from '@lightdash/common';
import type { QueryClient } from '@tanstack/react-query';
import * as rudderSDK from 'rudder-sdk-js';
import { getRequestUrl, SERVER_ERROR_MARKER } from '../../api';
import { LIGHTDASH_APP_NAME } from '../Tracking/constants';

const MAX_RETRIES = 3;

/**
 * Returns true when the error looks like a transient server/network failure
 * worth retrying.
 *
 * Provenance check first: only errors that flowed through `handleError` in
 * `api.ts` carry `SERVER_ERROR_MARKER`. `ApiError`-shaped objects fabricated
 * inside `queryFn` bodies (e.g. the synthetic 5xx thrown by
 * `useUnderlyingDataResults` / `useQueryResults` for warehouse cancel /
 * expire / error, or `useSavedSqlChartResults`'s defensive catch wrapping a
 * processing exception) do **not** carry the marker and are intentionally
 * never retried — retrying them would just delay surfacing the real error.
 *
 * Shape check second: among real network-layer errors, retry only when the
 * shape indicates a transient failure (NetworkError or 5xx).
 */
export const isRetryableTransientApiError = (error: unknown): boolean => {
    if (error == null || typeof error !== 'object') {
        return false;
    }

    if (!(SERVER_ERROR_MARKER in error)) {
        return false;
    }

    const apiError = error as Partial<ApiError>;
    const statusCode = apiError.error?.statusCode;
    const errorName = apiError.error?.name;

    // Retry on network errors (database connection issues, fetch timeouts).
    if (errorName === 'NetworkError') {
        return true;
    }

    // Retry on 5xx server errors (backend/database overwhelmed, gateway timeouts).
    if (
        typeof statusCode === 'number' &&
        statusCode >= 500 &&
        statusCode < 600
    ) {
        return true;
    }

    // Don't retry on 4xx client errors (bad request, not found, unauthorized, etc.).
    return false;
};

// Assume online unless navigator.onLine is false. True doesn't guarantee connectivity.
const isBrowserOnline = (): boolean => {
    if (typeof navigator === 'undefined') return true;
    if (typeof navigator.onLine !== 'boolean') return true;
    return navigator.onLine;
};

/**
 * Default retry function wired into the QueryClient. Gated by the server-side
 * `retryQueryOnTransientErrors` health flag (from `LIGHTDASH_QUERY_RETRY_ON_TRANSIENT_ERRORS`)
 * once `/health` has loaded.
 *
 * - While health is **not** in the cache yet (cold reload, parallel queries),
 *   transient failures **may** retry so the first error doesn't surface only
 *   because `/health` hasn't resolved.
 * - After health loads, retries run **only** when `retryQueryOnTransientErrors === true`.
 *   If the flag is `false` or missing, transient query retries are off.
 *
 * - Up to {@link MAX_RETRIES} retries (4 total attempts including the initial).
 * - Only retries transient HTTP/network failures (see {@link isRetryableTransientApiError}).
 * - Backoff schedule is defined in {@link defaultQueryRetryDelay}.
 */
export const defaultQueryRetry = (
    queryClient: QueryClient,
    failureCount: number,
    error: unknown,
): boolean => {
    const health = queryClient.getQueryData<HealthState>(['health']);
    if (health !== undefined) {
        if (health.query?.retryQueryOnTransientErrors !== true) {
            return false;
        }
    }

    if (failureCount >= MAX_RETRIES) {
        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn(
                `[query retry] giving up after ${failureCount} failures`,
            );
        }
        return false;
    }

    // Skip retries while offline; refetchOnReconnect handles recovery.
    if (!isBrowserOnline()) {
        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn(
                `[query retry] skipping retry — navigator.onLine is false`,
            );
        }
        return false;
    }

    const willRetry = isRetryableTransientApiError(error);
    if (willRetry) {
        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn(
                `[query retry] attempt ${failureCount + 1}/${MAX_RETRIES}, retrying…`,
            );
        }
        // Fire-and-forget analytics. The rudder SDK queues calls until it's
        // loaded, so retries that fire before TrackingProvider mounts are
        // queued (or dropped on instances without rudder configured). The
        // try/catch ensures analytics can never break retry behaviour.
        try {
            const apiError = error as Partial<ApiError>;
            rudderSDK.track(`${LIGHTDASH_APP_NAME}.query_retry.attempt`, {
                url: getRequestUrl(error),
                attempt: failureCount + 1,
                maxRetries: MAX_RETRIES,
                statusCode: apiError?.error?.statusCode,
                errorName: apiError?.error?.name,
            });
        } catch {
            // swallow — analytics must never affect query behaviour
        }
    }
    return willRetry;
};

/**
 * Full-jitter exponential backoff (AWS-style): each delay is sampled uniformly
 * from [base, 2 * base) where base doubles per attempt.
 *
 *   attempt 0:  4–8 s   (base 4 s)
 *   attempt 1:  8–16 s  (base 8 s)
 *   attempt 2: 16–32 s  (base 16 s)
 *
 * Worst-case total wait before giving up: ~28–56 s + 4 fetch durations.
 */
export const defaultQueryRetryDelay = (attemptIndex: number): number => {
    const base = 4000 * 2 ** attemptIndex;
    return base + Math.random() * base;
};
