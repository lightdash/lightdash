import { ExpectedNotFoundError, NotFoundError } from '@lightdash/common';
import { errorHandler } from './errors';

describe('handled API error reporting', () => {
    it('preserves expected not-found errors without reporting them', () => {
        const error = new ExpectedNotFoundError('Optional resource not found');
        const errorResponse = errorHandler(error);

        expect(errorResponse).toBe(error);
        expect(errorResponse.isExpected).toBe(true);
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error).toMatchObject({
            name: 'NotFoundError',
            statusCode: 404,
            data: {},
        });
        expect(Object.keys(error)).not.toContain('isExpected');
    });

    it('continues reporting ordinary not-found errors', () => {
        expect(
            errorHandler(new NotFoundError('Required resource not found'))
                .isExpected,
        ).toBe(false);
    });
});
