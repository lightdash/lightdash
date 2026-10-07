import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    ExpectedNotFoundError,
    isExpectedError,
    NotFoundError,
} from '@lightdash/common';
import { errorHandler } from './errors';

describe('handled API error reporting', () => {
    it('preserves expected not-found errors without reporting them', () => {
        const error = new ExpectedNotFoundError('Optional resource not found');
        const errorResponse = errorHandler(error);

        expect(errorResponse).toBe(error);
        expect(isExpectedError(errorResponse)).toBe(true);
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
            isExpectedError(
                errorHandler(new NotFoundError('Required resource not found')),
            ),
        ).toBe(false);
    });

    it('requires expected errors to be Error instances', () => {
        expect(isExpectedError({ isExpected: true })).toBe(false);
    });
});

describe('agent identity refusal API response', () => {
    it.each([
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
    ])('preserves the typed %s refusal for the API error handler', (reason) => {
        const error = new AiAccessRefusedError(reason);
        const response = errorHandler(error);
        expect(response.statusCode).toBe(403);
        expect(response.data).toEqual(error.refusal);
        expect(response.message).toBe(error.refusal.message);
    });
});
