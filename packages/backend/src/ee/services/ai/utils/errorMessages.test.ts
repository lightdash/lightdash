import { McpAuthorizationRequiredError } from '../AiAgentMcpRuntimeClient';
import {
    AiAgentEmptyResponseError,
    EMPTY_RESPONSE_MESSAGE,
    getUserFacingErrorMessage,
    PROVIDER_BILLING_MESSAGE,
} from './errorMessages';

const CONTEXT_LIMIT_MESSAGE =
    "This request exceeded the AI model's context limit, usually because the conversation or tool results became too large. Please start a new thread or break the request into smaller steps.";

const RATE_LIMIT_MESSAGE =
    'The service is experiencing high demand. Please try again in a few moments.';

const TIMEOUT_MESSAGE =
    'This request took too long to process. Try breaking it into smaller questions or start a new thread.';

describe('getUserFacingErrorMessage', () => {
    describe('empty response invariant', () => {
        it('maps AiAgentEmptyResponseError to the user-facing empty-response message', () => {
            const error = new AiAgentEmptyResponseError('stop', 3);
            expect(getUserFacingErrorMessage(error)).toBe(
                EMPTY_RESPONSE_MESSAGE,
            );
            expect(error.finishReason).toBe('stop');
            expect(error.stepsCount).toBe(3);
        });
    });

    describe('context/token limit errors', () => {
        it.each([
            // OpenAI error code
            'context_length_exceeded',
            // OpenAI user-facing message
            'Your input exceeds the context window of this model. Please adjust your input and try again.',
            // Anthropic-style
            'input exceeds the context window',
            // Generic provider messages
            'maximum context length is 128000 tokens',
            'This model has a token limit of 200000',
            'Request too long for model',
            'context window exceeded',
            // Token count pattern: "12345 tokens > 8000"
            '150000 tokens > 128000',
            '12345 token > 8000',
            // Verbose provider error
            'The request exceeds the maximum context length for this model',
            "exceeds the model's maximum token limit",
        ])('detects context limit error: %s', (message) => {
            expect(
                getUserFacingErrorMessage(
                    new Error(message),
                    undefined,
                    'self-managed',
                ),
            ).toBe(CONTEXT_LIMIT_MESSAGE);
        });

        it('detects context limit from an Error object', () => {
            const error = new Error('context_length_exceeded: input too large');
            expect(getUserFacingErrorMessage(error)).toBe(
                CONTEXT_LIMIT_MESSAGE,
            );
        });

        it('detects context limit from a plain string', () => {
            expect(
                getUserFacingErrorMessage(
                    'Your input exceeds the context window',
                ),
            ).toBe(CONTEXT_LIMIT_MESSAGE);
        });
    });

    describe('rate limiting errors', () => {
        it.each([
            'rate limit exceeded',
            'You have exceeded your quota',
            'Request was throttled',
        ])('detects rate limit error: %s', (message) => {
            expect(
                getUserFacingErrorMessage(
                    new Error(message),
                    undefined,
                    'self-managed',
                ),
            ).toBe(RATE_LIMIT_MESSAGE);
        });
    });

    describe('provider billing errors', () => {
        it.each([
            'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
            'insufficient_quota',
            'Provider billing is not enabled',
            'Monthly spend limit reached',
            'payment_required',
            'HTTP 402 Payment Required',
        ])(
            'shows actionable billing guidance for self-managed keys: %s',
            (message) => {
                expect(
                    getUserFacingErrorMessage(
                        new Error(message),
                        'Custom fallback',
                        'self-managed',
                    ),
                ).toBe(PROVIDER_BILLING_MESSAGE);
            },
        );

        it('does not expose provider billing errors for Lightdash-managed keys', () => {
            expect(
                getUserFacingErrorMessage(
                    new Error('Your credit balance is too low'),
                    'Custom fallback',
                    'lightdash-managed',
                ),
            ).toBe('Custom fallback');
        });

        it('preserves the existing quota message for Lightdash-managed keys', () => {
            expect(
                getUserFacingErrorMessage(
                    new Error('insufficient_quota'),
                    'Custom fallback',
                    'lightdash-managed',
                ),
            ).toBe(RATE_LIMIT_MESSAGE);
        });
    });

    describe('timeout errors', () => {
        it.each(['Request timeout', 'The operation timed out'])(
            'detects timeout error: %s',
            (message) => {
                expect(
                    getUserFacingErrorMessage(
                        new Error(message),
                        undefined,
                        'self-managed',
                    ),
                ).toBe(TIMEOUT_MESSAGE);
            },
        );
    });

    describe('default fallback', () => {
        it('returns MCP authorization required errors directly', () => {
            expect(
                getUserFacingErrorMessage(
                    new McpAuthorizationRequiredError(
                        'Shared Docs MCP',
                        'server-uuid',
                        'shared',
                    ),
                    undefined,
                    'self-managed',
                ),
            ).toBe(
                'MCP server "Shared Docs MCP" requires authorization before this agent can use it.',
            );
        });

        it('returns default message for unknown errors', () => {
            expect(
                getUserFacingErrorMessage(new Error('Something unexpected')),
            ).toBe(
                'Something went wrong while processing your request. Please try again.',
            );
        });

        it('returns custom default message when provided', () => {
            expect(
                getUserFacingErrorMessage(
                    new Error('Something unexpected'),
                    'Custom fallback',
                ),
            ).toBe('Custom fallback');
        });
    });
});
