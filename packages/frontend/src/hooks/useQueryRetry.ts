import type { ApiError } from '@lightdash/common';
import { useMemo } from 'react';
import useApp from '../providers/App/useApp';
import { shouldRetryQuery } from '../providers/ReactQuery/createQueryClient';

const MAX_SERVER_ERROR_RETRIES = 3;

// Client-side chart processing failures are wrapped as an ApiError with a
// borrowed 5xx status; they are deterministic, so retrying only delays them.
export const CHART_RESULTS_ERROR_NAME = 'ChartResultsError';

const is5xxError = (error: unknown): boolean => {
    const statusCode = (error as Partial<ApiError>)?.error?.statusCode;
    return statusCode !== undefined && statusCode >= 500 && statusCode < 600;
};

const isSynthesizedClientError = (error: unknown): boolean =>
    (error as Partial<ApiError>)?.error?.name === CHART_RESULTS_ERROR_NAME;

/**
 * Opt-in retry for 5xx responses, layered on top of the global NetworkError
 * retry rather than replacing it — the global policy is more generous for
 * transport failures (5 attempts, 8s cap) than this one is for 5xx.
 */
export const getRetryConfig = (retryEnabled: boolean) =>
    retryEnabled
        ? {
              retry: (failureCount: number, error: unknown) =>
                  shouldRetryQuery(failureCount, error) ||
                  (failureCount < MAX_SERVER_ERROR_RETRIES &&
                      is5xxError(error) &&
                      !isSynthesizedClientError(error)),
          }
        : {};

export const useQueryRetryConfig = () => {
    const { health } = useApp();
    const retryEnabled =
        health.data?.query.retryQueryOnTransientErrors ?? false;

    return useMemo(() => getRetryConfig(retryEnabled), [retryEnabled]);
};
