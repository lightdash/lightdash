import { classifyClaudeCliFailure } from './claudeCliFailure';

describe('classifyClaudeCliFailure', () => {
    test('classifies Anthropic credit-balance error from stdout', () => {
        const stdout = JSON.stringify({
            type: 'result',
            subtype: 'error',
            error: 'Your credit balance is too low to access the Claude API. Please go to Plans & Billing to upgrade or purchase credits.',
        });
        const result = classifyClaudeCliFailure('', stdout);
        expect(result.category).toBe('quota');
        if (result.category !== 'unknown') {
            expect(result.userMessage).toMatch(/out of credits/i);
        }
    });

    test('classifies insufficient_quota error from stderr', () => {
        const result = classifyClaudeCliFailure(
            'API Error 400: insufficient_quota',
            '',
        );
        expect(result.category).toBe('quota');
    });

    test('classifies Anthropic rate_limit_error', () => {
        const result = classifyClaudeCliFailure(
            '',
            '{"error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}',
        );
        expect(result.category).toBe('rate_limit');
    });

    test('classifies Bedrock ThrottlingException as rate_limit', () => {
        const result = classifyClaudeCliFailure(
            'ThrottlingException: Too many requests',
            '',
        );
        expect(result.category).toBe('rate_limit');
    });

    test('classifies Anthropic invalid_api_key as auth', () => {
        const result = classifyClaudeCliFailure(
            '',
            '{"error":{"type":"authentication_error","message":"invalid_api_key: x-api-key header"}}',
        );
        expect(result.category).toBe('auth');
    });

    test('classifies Bedrock AccessDeniedException as auth', () => {
        const result = classifyClaudeCliFailure(
            'AccessDeniedException: not authorized to invoke this model',
            '',
        );
        expect(result.category).toBe('auth');
    });

    test('classifies Anthropic overloaded_error', () => {
        const result = classifyClaudeCliFailure(
            '',
            '{"error":{"type":"overloaded_error","message":"Overloaded"}}',
        );
        expect(result.category).toBe('overloaded');
    });

    test('returns unknown for empty output', () => {
        const result = classifyClaudeCliFailure('', '');
        expect(result).toEqual({ category: 'unknown' });
    });

    test('returns unknown for a generic crash with no matching signature', () => {
        const result = classifyClaudeCliFailure(
            'Error: ENOENT: no such file or directory',
            '',
        );
        expect(result).toEqual({ category: 'unknown' });
    });

    test('is case-insensitive', () => {
        const result = classifyClaudeCliFailure('CREDIT BALANCE TOO LOW', '');
        expect(result.category).toBe('quota');
    });
});
