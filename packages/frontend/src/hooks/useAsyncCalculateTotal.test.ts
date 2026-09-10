import { describe, expect, it } from 'vitest';
import { isTotalsNotSupportedError } from './useAsyncCalculateTotal';

describe('isTotalsNotSupportedError', () => {
    it('is true for a NotSupportedError api response', () => {
        expect(
            isTotalsNotSupportedError({
                status: 'error',
                error: {
                    name: 'NotSupportedError',
                    statusCode: 400,
                    message: 'Nothing to total',
                    data: {},
                },
            }),
        ).toBe(true);
    });

    it('is false for other api errors and plain errors', () => {
        expect(
            isTotalsNotSupportedError({
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message: 'Forbidden',
                    data: {},
                },
            }),
        ).toBe(false);
        expect(isTotalsNotSupportedError(new Error('boom'))).toBe(false);
        expect(isTotalsNotSupportedError(undefined)).toBe(false);
    });
});
