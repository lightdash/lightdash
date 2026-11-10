import { APICallError, RetryError } from 'ai';
import {
    classifySuggestionError,
    SuggestionGenerationError,
    type SuggestionFallbackReason,
} from './suggestionErrors';

const apiError = (message: string, cause?: unknown) =>
    new APICallError({
        message,
        url: 'https://provider.test',
        requestBodyValues: {},
        cause,
    });

describe('classifySuggestionError', () => {
    it('classifies provider errors', () => {
        expect(classifySuggestionError(apiError('invalid credentials'))).toBe(
            'provider',
        );
        expect(classifySuggestionError(new Error('unavailable'))).toBe(
            'provider',
        );
        expect(classifySuggestionError(null)).toBe('provider');
    });
    it.each(['TimeoutError', 'AbortError'])('classifies %s', (name) => {
        expect(classifySuggestionError({ name })).toBe('timeout');
        expect(
            classifySuggestionError(
                Object.assign(new Error('aborted'), { name }),
            ),
        ).toBe('timeout');
    });
    it.each([
        'schema',
        'provider',
        'parse',
        'timeout',
        'context_load',
    ] satisfies SuggestionFallbackReason[])('preserves %s', (reason) => {
        expect(
            classifySuggestionError(
                new SuggestionGenerationError(reason, null),
            ),
        ).toBe(reason);
    });
    it.each([
        'ETIMEDOUT',
        'ECONNABORTED',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
    ])('classifies code %s', (code) => {
        expect(classifySuggestionError(apiError('failed', { code }))).toBe(
            'timeout',
        );
        expect(classifySuggestionError({ code })).toBe('timeout');
    });
    it('classifies provider and retry timeout messages and nested causes', () => {
        expect(
            classifySuggestionError(
                apiError('failed', new Error('request timed out')),
            ),
        ).toBe('timeout');
        expect(classifySuggestionError(apiError('failed', 'timeout'))).toBe(
            'timeout',
        );
        expect(classifySuggestionError(apiError('request timed out'))).toBe(
            'timeout',
        );
        expect(
            classifySuggestionError(
                new RetryError({
                    message: 'retries exhausted',
                    reason: 'maxRetriesExceeded',
                    errors: [apiError('failed', { code: 'ETIMEDOUT' })],
                }),
            ),
        ).toBe('timeout');
    });
});
