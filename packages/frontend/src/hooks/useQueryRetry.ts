import type { ApiError } from '@lightdash/common';

/**
 * Determines if an API error is retryable (transient database/server issues)
 * @param error The API error from the query
 * @returns true if the error should be retried
 */
export const isRetryableError = (
    error: ApiError | Partial<ApiError>,
): boolean => {
    const statusCode = error.error?.statusCode;
    const errorName = error.error?.name;

    // Retry on network errors (database connection issues, timeouts)
    if (errorName === 'NetworkError') {
        return true;
    }

    // Retry on 5xx server errors (backend/database overwhelmed)
    if (statusCode && statusCode >= 500 && statusCode < 600) {
        return true;
    }

    // Don't retry on 4xx client errors (bad request, not found, unauthorized, etc.)
    return false;
};

/**
 * Calculate exponential backoff delay for retries
 * @param attemptIndex Zero-based retry attempt (0, 1, 2)
 * @returns Delay in milliseconds
 */
export const getRetryDelay = (attemptIndex: number): number => {
    // Exponential backoff: 1s, 2s, 4s
    return Math.min(1000 * 2 ** attemptIndex, 4000);
};

/**
 * Default retry configuration for React Query hooks
 * - Max 3 retry attempts
 * - Exponential backoff (1s, 2s, 4s)
 * - Only retry on transient errors (5xx, NetworkError)
 */
export const defaultRetryConfig = {
    retry: (failureCount: number, error: ApiError | Partial<ApiError>) => {
        if (failureCount >= 3) {
            return false;
        }
        return isRetryableError(error);
    },
    retryDelay: getRetryDelay,
};
