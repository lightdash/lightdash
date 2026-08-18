import type { ApiError } from '@lightdash/common';
import { useMemo } from 'react';
import useApp from '../providers/App/useApp';
import { shouldRetryQuery } from '../providers/ReactQuery/createQueryClient';

const is5xxError = (error: unknown): boolean => {
    const statusCode = (error as Partial<ApiError>)?.error?.statusCode;
    return statusCode !== undefined && statusCode >= 500 && statusCode < 600;
};

export const getRetryConfig = (retryEnabled: boolean) =>
    retryEnabled
        ? {
              retry: (failureCount: number, error: unknown) =>
                  shouldRetryQuery(failureCount, error) ||
                  (failureCount < 3 && is5xxError(error)),
          }
        : {};

export const useQueryRetryConfig = () => {
    const { health } = useApp();
    const retryEnabled =
        health.data?.query.retryQueryOnTransientErrors ?? false;

    return useMemo(() => getRetryConfig(retryEnabled), [retryEnabled]);
};