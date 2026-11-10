import { describe, expect, it, vi } from 'vitest';
import {
    createSdkErrorReporter,
    toSdkError,
    toSdkRequestError,
} from './errors';

const apiError = (name: string, statusCode: number, message = 'Failed') => ({
    status: 'error',
    error: { name, statusCode, message, data: {} },
});

describe('toSdkRequestError', () => {
    it('maps transport failures to a retryable network error', () => {
        expect(
            toSdkRequestError(apiError('NetworkError', 500), [
                'embed-dashboard',
            ]),
        ).toEqual({
            kind: 'network',
            status: null,
            message: 'Failed',
            retryable: true,
            fatal: true,
        });
    });

    it('detects expired and invalid embed tokens', () => {
        expect(
            toSdkRequestError(
                apiError(
                    'ForbiddenError',
                    403,
                    'Your embed token has expired.',
                ),
                ['embed-dashboard'],
            ).kind,
        ).toBe('token_expired');
        expect(
            toSdkRequestError(
                apiError('ForbiddenError', 403, 'Invalid embed token: bad'),
                ['embed-dashboard'],
            ).kind,
        ).toBe('invalid_token');
    });

    it('maps status codes to kinds', () => {
        const kindOf = (status: number) =>
            toSdkRequestError(apiError('Error', status), null).kind;
        expect(kindOf(401)).toBe('unauthorized');
        expect(kindOf(403)).toBe('forbidden');
        expect(kindOf(404)).toBe('not_found');
        expect(kindOf(422)).toBe('invalid_request');
        expect(kindOf(500)).toBe('server');
    });

    it('marks only requests that replace the whole embed as fatal', () => {
        const error = apiError('NotFoundError', 404);
        expect(toSdkRequestError(error, ['saved_query', 'uuid']).fatal).toBe(
            true,
        );
        expect(toSdkRequestError(error, ['tables', 'orders']).fatal).toBe(true);
        expect(
            toSdkRequestError(error, ['dashboard_chart_ready_query']).fatal,
        ).toBe(false);
        expect(toSdkRequestError(error, null).fatal).toBe(false);
    });

    it('treats token failures from any request as fatal', () => {
        expect(
            toSdkRequestError(
                apiError('ForbiddenError', 403, 'Invalid embed token: bad'),
                ['user'],
            ).fatal,
        ).toBe(true);
    });

    it('only retries transient failures', () => {
        expect(toSdkRequestError(apiError('Error', 503), null).retryable).toBe(
            true,
        );
        expect(toSdkRequestError(apiError('Error', 429), null).retryable).toBe(
            true,
        );
        expect(toSdkRequestError(apiError('Error', 404), null).retryable).toBe(
            false,
        );
    });
});

describe('toSdkError', () => {
    it('wraps non-API errors with the given kind', () => {
        expect(
            toSdkError(new Error('Invalid JWT token'), {
                fatal: true,
                kind: 'invalid_token',
            }),
        ).toEqual({
            kind: 'invalid_token',
            status: null,
            message: 'Invalid JWT token',
            retryable: false,
            fatal: true,
        });
    });
});

describe('createSdkErrorReporter', () => {
    it('stops reporting after the first fatal error', () => {
        const handler = vi.fn();
        const report = createSdkErrorReporter(() => handler);
        const error = toSdkRequestError(apiError('Error', 500), null);

        report(error);
        report({ ...error, fatal: true });
        report(error);

        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler).toHaveBeenLastCalledWith({ ...error, fatal: true });
    });
});
