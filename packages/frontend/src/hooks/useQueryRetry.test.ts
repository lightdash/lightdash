import { describe, expect, it } from 'vitest';
import { getRetryConfig } from './useQueryRetry';

const networkError = { error: { name: 'NetworkError', statusCode: 500 } };
const serverError = {
    error: { name: 'UnexpectedServerError', statusCode: 500 },
};
const notFound = { error: { name: 'NotFoundError', statusCode: 404 } };

describe('getRetryConfig', () => {
    it('inherits the global retry configuration when disabled', () => {
        expect(getRetryConfig(false)).toEqual({});
    });

    it('preserves global NetworkError retries when enabled', () => {
        const retry = getRetryConfig(true).retry;

        expect(retry?.(0, networkError)).toBe(true);
        expect(retry?.(4, networkError)).toBe(true);
        expect(retry?.(5, networkError)).toBe(false);
    });

    it('adds up to 3 retries for 5xx errors when enabled', () => {
        const retry = getRetryConfig(true).retry;

        expect(retry?.(0, serverError)).toBe(true);
        expect(retry?.(2, serverError)).toBe(true);
        expect(retry?.(3, serverError)).toBe(false);
        expect(retry?.(0, notFound)).toBe(false);
    });

    it('inherits the global retry delay when enabled', () => {
        expect(getRetryConfig(true)).not.toHaveProperty('retryDelay');
    });
});