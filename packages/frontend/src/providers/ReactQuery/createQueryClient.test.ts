import { describe, expect, it, vi } from 'vitest';
import {
    createQueryClient,
    getQueryRetryDelay,
    shouldRetryQuery,
} from './createQueryClient';

const networkError = { error: { name: 'NetworkError', statusCode: 500 } };
const serverError = {
    error: { name: 'UnexpectedServerError', statusCode: 500 },
};
const synthesizedQueryError = { error: { name: 'Error', statusCode: 500 } };
const notFound = { error: { name: 'NotFoundError', statusCode: 404 } };
const resultsPageBusy = {
    error: {
        name: 'ResultsPageBusyError',
        statusCode: 503,
        data: { retryAfterSeconds: 3 },
    },
};

describe('shouldRetryQuery', () => {
    it('retries transient NetworkError up to 5 times', () => {
        expect(shouldRetryQuery(0, networkError)).toBe(true);
        expect(shouldRetryQuery(4, networkError)).toBe(true);
        expect(shouldRetryQuery(5, networkError)).toBe(false);
    });

    it('does not retry real server errors, synthesized query failures or 4xx', () => {
        expect(shouldRetryQuery(0, serverError)).toBe(false);
        expect(shouldRetryQuery(0, synthesizedQueryError)).toBe(false);
        expect(shouldRetryQuery(0, notFound)).toBe(false);
    });

    it('does not retry malformed errors', () => {
        expect(shouldRetryQuery(0, undefined)).toBe(false);
        expect(shouldRetryQuery(0, {})).toBe(false);
    });
});

describe('busy results pages', () => {
    it('retries a busy results page up to 10 times', () => {
        expect(shouldRetryQuery(0, resultsPageBusy)).toBe(true);
        expect(shouldRetryQuery(9, resultsPageBusy)).toBe(true);
        expect(shouldRetryQuery(10, resultsPageBusy)).toBe(false);
    });

    it('waits at least the Retry-After the server asked for, capped at 8s', () => {
        expect(getQueryRetryDelay(0, resultsPageBusy)).toBe(3000);
        expect(getQueryRetryDelay(2, resultsPageBusy)).toBe(4000);
        expect(getQueryRetryDelay(5, resultsPageBusy)).toBe(8000);
        expect(
            getQueryRetryDelay(0, {
                error: {
                    name: 'ResultsPageBusyError',
                    statusCode: 503,
                    data: { retryAfterSeconds: 60 },
                },
            }),
        ).toBe(8000);
    });
});

describe('getQueryRetryDelay', () => {
    it('backs off exponentially capped at 8s', () => {
        expect(getQueryRetryDelay(0)).toBe(1000);
        expect(getQueryRetryDelay(1)).toBe(2000);
        expect(getQueryRetryDelay(2)).toBe(4000);
        expect(getQueryRetryDelay(3)).toBe(8000);
        expect(getQueryRetryDelay(4)).toBe(8000);
    });
});

describe('createQueryClient onError', () => {
    it('reports failed queries and mutations with their key', async () => {
        const onError = vi.fn();
        const queryClient = createQueryClient(
            { queries: { retry: false } },
            onError,
        );

        await queryClient
            .fetchQuery({
                queryKey: ['embed-dashboard', 'project'],
                queryFn: () => Promise.reject(notFound),
            })
            .catch(() => undefined);
        await queryClient
            .getMutationCache()
            .build(queryClient, {
                mutationKey: ['dashboard_create'],
                mutationFn: () => Promise.reject(serverError),
            })
            .execute()
            .catch(() => undefined);

        expect(onError).toHaveBeenCalledWith(notFound, [
            'embed-dashboard',
            'project',
        ]);
        expect(onError).toHaveBeenCalledWith(serverError, ['dashboard_create']);
    });
});
