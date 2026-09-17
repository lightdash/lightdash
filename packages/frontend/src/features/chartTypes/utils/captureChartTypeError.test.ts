import { captureException } from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureChartTypeError } from './captureChartTypeError';

vi.mock('@sentry/react', () => ({
    captureException: vi.fn(),
}));

describe('captureChartTypeError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('wraps an ApiError with per-class fingerprint and status tag', () => {
        captureChartTypeError(
            'chartTypeInstall',
            {
                status: 'error',
                error: {
                    name: 'NotFoundError',
                    statusCode: 404,
                    message: 'Chart not found in registry',
                    data: {},
                },
            },
            { chartSlug: 'big-number-with-sparkline-trend' },
        );

        expect(captureException).toHaveBeenCalledTimes(1);
        const [error, context] = vi.mocked(captureException).mock.calls[0];
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
            'chartTypeInstall: NotFoundError (404)',
        );
        expect(context).toMatchObject({
            fingerprint: ['chartTypeInstall', '404'],
            tags: { errorType: 'chartTypeInstall', statusCode: '404' },
            extra: {
                chartSlug: 'big-number-with-sparkline-trend',
                apiErrorMessage: 'Chart not found in registry',
            },
        });
    });

    it('captures non-ApiError causes with an unknown status', () => {
        captureChartTypeError('chartTypeLibraryLoad', new TypeError('boom'), {
            projectUuid: 'p1',
        });

        const [error, context] = vi.mocked(captureException).mock.calls[0];
        expect((error as Error).message).toBe(
            'chartTypeLibraryLoad: TypeError: boom',
        );
        expect(context).toMatchObject({
            fingerprint: ['chartTypeLibraryLoad', 'unknown'],
            tags: { errorType: 'chartTypeLibraryLoad', statusCode: 'unknown' },
            extra: { projectUuid: 'p1' },
        });
    });
});
