import { describe, expect, it } from 'vitest';
import { isRetryableError } from './useQueryRetry';

describe('isRetryableError', () => {
    it('retries network and server errors', () => {
        expect(
            isRetryableError({
                error: {
                    name: 'NetworkError',
                    statusCode: 0,
                    message: 'Network error',
                    data: {},
                },
            }),
        ).toBe(true);
        expect(
            isRetryableError({
                error: {
                    name: 'UnexpectedServerError',
                    statusCode: 500,
                    message: 'Server error',
                    data: {},
                },
            }),
        ).toBe(true);
    });

    it('does not retry client-side chart processing failures', () => {
        expect(
            isRetryableError({
                error: {
                    name: 'ChartResultsError',
                    statusCode: 500,
                    message: 'Chart processing failed',
                    data: {},
                },
            }),
        ).toBe(false);
    });

    it('does not retry client errors', () => {
        expect(
            isRetryableError({
                error: {
                    name: 'BadRequestError',
                    statusCode: 400,
                    message: 'Bad request',
                    data: {},
                },
            }),
        ).toBe(false);
    });
});