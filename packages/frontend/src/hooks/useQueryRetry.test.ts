import { describe, expect, it } from 'vitest';
import { CHART_RESULTS_ERROR_NAME, getRetryConfig } from './useQueryRetry';

const networkError = { error: { name: 'NetworkError', statusCode: 500 } };
const serverError = {
    error: { name: 'UnexpectedServerError', statusCode: 500 },
};
const notFound = { error: { name: 'NotFoundError', statusCode: 404 } };
const chartResultsError = {
    error: { name: CHART_RESULTS_ERROR_NAME, statusCode: 500 },
};

describe('getRetryConfig', () => {
    it('inherits the global retry config when disabled', () => {
        expect(getRetryConfig(false)).toEqual({});
    });

    it('keeps the global 5 NetworkError attempts when enabled', () => {
        const { retry } = getRetryConfig(true);

        expect(retry?.(0, networkError)).toBe(true);
        expect(retry?.(4, networkError)).toBe(true);
        expect(retry?.(5, networkError)).toBe(false);
    });

    it('adds up to 3 attempts for 5xx errors when enabled', () => {
        const { retry } = getRetryConfig(true);

        expect(retry?.(0, serverError)).toBe(true);
        expect(retry?.(2, serverError)).toBe(true);
        expect(retry?.(3, serverError)).toBe(false);
    });

    it('does not retry client-side chart processing failures', () => {
        const { retry } = getRetryConfig(true);

        expect(retry?.(0, chartResultsError)).toBe(false);
    });

    it('does not retry 4xx errors when enabled', () => {
        const { retry } = getRetryConfig(true);

        expect(retry?.(0, notFound)).toBe(false);
    });

    it('never overrides the global retry delay', () => {
        expect(getRetryConfig(true)).not.toHaveProperty('retryDelay');
        expect(getRetryConfig(false)).not.toHaveProperty('retryDelay');
    });
});
