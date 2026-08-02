import { classifyClaudeCliFailure } from './claudeCliFailure';

// Condensed from real CLI stream-json output: the final `result` event
// carries the failure as structured fields plus a human-readable message.
const cliResultLine = (apiErrorStatus: number, resultText: string): string =>
    JSON.stringify({
        is_error: true,
        terminal_reason: 'api_error',
        subtype: 'success',
        api_error_status: apiErrorStatus,
        result: resultText,
        type: 'result',
    });

const streamWithResult = (resultLine: string): string =>
    [
        '{"type":"system","subtype":"init","session_id":"abc"}',
        '{"type":"system","subtype":"api_retry","attempt":1,"max_retries":10,"retry_delay_ms":511,"error_status":401,"error":"authentication_failed"}',
        resultLine,
    ].join('\n');

describe('classifyClaudeCliFailure', () => {
    test('classifies monthly spend limit from the result event as non-retryable', () => {
        const detail =
            'API Error: 400 Your organization has reached its monthly spend limit. Your limit will reset on the first of next month, or you can increase your limit in the Console.';
        const result = classifyClaudeCliFailure(
            '',
            streamWithResult(cliResultLine(400, detail)),
        );
        expect(result.category).toBe('spend_limit');
        expect(result.retryable).toBe(false);
        expect(result.userMessage).toMatch(/usage limit/i);
        expect(result.providerDetail).toBe(detail);
    });

    test('classifies a 401 by status even though the CLI rewrites the message', () => {
        const result = classifyClaudeCliFailure(
            '',
            streamWithResult(
                cliResultLine(
                    401,
                    'Failed to authenticate. API Error: 401 API key is invalid.',
                ),
            ),
        );
        expect(result.category).toBe('auth');
        expect(result.retryable).toBe(false);
    });

    test('classifies a 429 from the result event as retryable', () => {
        const result = classifyClaudeCliFailure(
            '',
            streamWithResult(
                cliResultLine(
                    429,
                    'API Error: Request rejected (429) · Number of request tokens has exceeded your per-minute rate limit',
                ),
            ),
        );
        expect(result.category).toBe('rate_limit');
        expect(result.retryable).toBe(true);
    });

    test("classifies the CLI's canned credit-balance message on a 400", () => {
        const result = classifyClaudeCliFailure(
            '',
            streamWithResult(cliResultLine(400, 'Credit balance is too low')),
        );
        expect(result.category).toBe('quota');
        expect(result.retryable).toBe(false);
        expect(result.userMessage).toMatch(/out of credits/i);
    });

    test('classifies a 402 billing error by status', () => {
        const result = classifyClaudeCliFailure(
            '',
            streamWithResult(
                cliResultLine(402, 'API Error: 402 billing problem'),
            ),
        );
        expect(result.category).toBe('billing');
        expect(result.retryable).toBe(false);
    });

    test('classifies a 5xx from the result event as overloaded', () => {
        const result = classifyClaudeCliFailure(
            '',
            streamWithResult(cliResultLine(529, 'API Error: 529 Overloaded')),
        );
        expect(result.category).toBe('overloaded');
        expect(result.retryable).toBe(true);
    });

    test('marks an unrecognized 4xx as unknown but non-retryable', () => {
        const detail = 'API Error: 400 some new validation failure';
        const result = classifyClaudeCliFailure(
            '',
            streamWithResult(cliResultLine(400, detail)),
        );
        expect(result).toEqual({
            category: 'unknown',
            retryable: false,
            userMessage: null,
            providerDetail: detail,
        });
    });

    test('classifies a Claude subscription usage-limit message without a result event', () => {
        const result = classifyClaudeCliFailure(
            '',
            'Claude AI usage limit reached|1753372800',
        );
        expect(result.category).toBe('spend_limit');
        expect(result.retryable).toBe(false);
    });

    test('classifies Bedrock ThrottlingException from stderr without a result event', () => {
        const result = classifyClaudeCliFailure(
            'ThrottlingException: Too many requests',
            '',
        );
        expect(result.category).toBe('rate_limit');
        expect(result.retryable).toBe(true);
    });

    test('classifies raw API error signatures via text fallback', () => {
        expect(
            classifyClaudeCliFailure(
                '',
                '{"error":{"type":"authentication_error","message":"invalid x-api-key header"}}',
            ).category,
        ).toBe('auth');
        expect(
            classifyClaudeCliFailure(
                '',
                '{"error":{"type":"overloaded_error","message":"Overloaded"}}',
            ).category,
        ).toBe('overloaded');
        expect(
            classifyClaudeCliFailure('API Error 400: insufficient_quota', '')
                .category,
        ).toBe('quota');
    });

    test('falls back to text matching when a result-looking line is not valid JSON', () => {
        const result = classifyClaudeCliFailure(
            '',
            '{"type":"result", truncated garbage\nCredit balance is too low',
        );
        expect(result.category).toBe('quota');
        expect(result.providerDetail).toBeNull();
    });

    test('returns retryable unknown for a generic crash with no matching signature', () => {
        const result = classifyClaudeCliFailure(
            'Error: ENOENT: no such file or directory',
            '',
        );
        expect(result).toEqual({
            category: 'unknown',
            retryable: true,
            userMessage: null,
            providerDetail: null,
        });
    });

    test('matches signatures case-insensitively', () => {
        const result = classifyClaudeCliFailure('CREDIT BALANCE TOO LOW', '');
        expect(result.category).toBe('quota');
    });
});
