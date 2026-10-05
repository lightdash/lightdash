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
