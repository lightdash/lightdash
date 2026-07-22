import { type ApiError } from '@lightdash/common';
import { getPlaygroundSetupFailure } from './playgroundSetupFailure';

const apiError = (name: string, message: string): ApiError => ({
    status: 'error',
    error: { name, statusCode: 404, message, data: {} },
});

describe('getPlaygroundSetupFailure', () => {
    it('detects an instance without playground support', () => {
        expect(
            getPlaygroundSetupFailure(
                apiError(
                    'NotFoundError',
                    'Playground projects are not available',
                ),
            ),
        ).toBe('unavailable');
    });

    it('detects a playground that was deleted', () => {
        expect(
            getPlaygroundSetupFailure(
                apiError(
                    'NotFoundError',
                    'Playground project was previously removed',
                ),
            ),
        ).toBe('previously-removed');
    });

    it('detects a permission failure', () => {
        expect(
            getPlaygroundSetupFailure(
                apiError(
                    'ForbiddenError',
                    'User is not part of an organization',
                ),
            ),
        ).toBe('forbidden');
    });

    it('falls back to unknown for unrecognised errors', () => {
        expect(
            getPlaygroundSetupFailure(
                apiError('UnexpectedServerError', 'boom'),
            ),
        ).toBe('unknown');
        expect(getPlaygroundSetupFailure(new Error('network'))).toBe('unknown');
    });
});
