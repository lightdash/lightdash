import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
import {
    defaultQueryRetry,
    defaultQueryRetryDelay,
} from './queryTransientRetry';

export const createQueryClient = (options?: DefaultOptions) => {
    const queryClient: QueryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: (failureCount, error) =>
                    defaultQueryRetry(queryClient, failureCount, error),
                retryDelay: defaultQueryRetryDelay,
                staleTime: 30000, // 30 seconds
                refetchOnWindowFocus: false,
                onError: async (result) => {
                    // @ts-ignore
                    const { error: { statusCode } = {} } = result;
                    if (statusCode === 401) {
                        await queryClient.invalidateQueries(['health']);
                    }
                },
                networkMode: 'always',
                ...options?.queries,
            },
            mutations: {
                // Mutations are not generally idempotent, so the global config
                // does not enable transient-error retries. To retry a specific
                // mutation, pass `retry` in that `useMutation` call (e.g.
                // `retry: 3` or a custom predicate using
                // `isRetryableTransientApiError`).
                networkMode: 'always',
                ...options?.mutations,
            },
        },
    });

    return queryClient;
};
