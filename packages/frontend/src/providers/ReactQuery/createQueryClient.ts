import { type ApiError } from '@lightdash/common';
import {
    MutationCache,
    QueryCache,
    QueryClient,
    type DefaultOptions,
    type QueryKey,
} from '@tanstack/react-query';
import { hashQueryKeyByView } from '../../features/semanticStudio/developmentView';

const MAX_QUERY_RETRIES = 5;
const MAX_BUSY_RESULTS_PAGE_RETRIES = 10;
const MAX_RETRY_DELAY_MS = 8000;

const isBusyResultsPage = (error: unknown): boolean =>
    (error as Partial<ApiError>)?.error?.name === 'ResultsPageBusyError';

// Retry transient transport failures (dropped/misrouted requests during
// rollouts, brief gateway timeouts) so a single blip doesn't surface an error.
// Real API errors and synthesized terminal query failures still surface at once.
export const shouldRetryQuery = (
    failureCount: number,
    error: unknown,
): boolean => {
    if (isBusyResultsPage(error)) {
        return failureCount < MAX_BUSY_RESULTS_PAGE_RETRIES;
    }
    return (
        (error as Partial<ApiError>)?.error?.name === 'NetworkError' &&
        failureCount < MAX_QUERY_RETRIES
    );
};

export const getQueryRetryDelay = (
    attemptIndex: number,
    error?: unknown,
): number => {
    const backoffMs = 1000 * 2 ** attemptIndex;
    const retryAfterSeconds: unknown = isBusyResultsPage(error)
        ? (error as ApiError).error.data?.retryAfterSeconds
        : undefined;
    const retryAfterMs =
        typeof retryAfterSeconds === 'number' &&
        Number.isFinite(retryAfterSeconds)
            ? retryAfterSeconds * 1000
            : 0;
    return Math.min(Math.max(backoffMs, retryAfterMs), MAX_RETRY_DELAY_MS);
};

// Fires once per failed query or mutation, after retries are exhausted
export type QueryClientErrorHandler = (
    error: unknown,
    key: QueryKey | null,
) => void;

export const createQueryClient = (
    options?: DefaultOptions,
    onError?: QueryClientErrorHandler,
) => {
    const queryClient = new QueryClient({
        queryCache: new QueryCache({
            onError: (error, query) => onError?.(error, query.queryKey),
        }),
        mutationCache: new MutationCache({
            onError: (error, _variables, _context, mutation) =>
                onError?.(error, mutation.options.mutationKey ?? null),
        }),
        defaultOptions: {
            queries: {
                retry: shouldRetryQuery,
                retryDelay: getQueryRetryDelay,
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
                queryKeyHashFn: hashQueryKeyByView,
                ...options?.queries,
            },
            mutations: {
                networkMode: 'always',
                ...options?.mutations,
            },
        },
    });

    return queryClient;
};
