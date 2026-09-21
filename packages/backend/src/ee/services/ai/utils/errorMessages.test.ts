import { APICallError, RetryError } from 'ai';
import { McpAuthorizationRequiredError } from '../AiAgentMcpRuntimeClient';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import {
    AiAgentEmptyResponseError,
    AiAgentStepCapReachedError,
    createUserFacingErrorResolver,
    EMPTY_RESPONSE_MESSAGE,
    getKnownUserFacingErrorMessage,
    getUserFacingErrorMessage,
    PROVIDER_BILLING_MESSAGE,
    STEP_CAP_REACHED_MESSAGE,
} from './errorMessages';
import {
    MCP_CONNECTION_MESSAGE,
    MCP_PERMISSION_MESSAGE,
    McpRuntimeError,
} from './mcpErrors';

const CONTEXT_LIMIT_MESSAGE =
    "This request exceeded the AI model's context limit, usually because the conversation or tool results became too large. Please start a new thread or break the request into smaller steps.";

const RATE_LIMIT_MESSAGE =
    'The service is experiencing high demand. Please try again in a few moments.';

const TIMEOUT_MESSAGE =
    'This request took too long to process. Try breaking it into smaller questions or start a new thread.';

describe('getUserFacingErrorMessage', () => {
    it('describes the step cap as a work limit with next actions', () => {
        expect(
            getUserFacingErrorMessage(new AiAgentStepCapReachedError(40)),
        ).toBe(STEP_CAP_REACHED_MESSAGE);
        expect(STEP_CAP_REACHED_MESSAGE).toContain('work limit');
        expect(STEP_CAP_REACHED_MESSAGE).toContain('split your request');
    });

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
        const apiCallError = ({
            statusCode = 400,
            data,
        }: {
            statusCode?: number;
            data?: unknown;
        }) =>
            new APICallError({
                message: 'Provider request failed',
                url: 'https://provider.example.com/v1/messages',
                requestBodyValues: {},
                statusCode,
                data,
            });

        it.each([
            [
                'Anthropic billing code',
                apiCallError({
                    data: {
                        type: 'error',
                        error: {
                            type: 'billing_error',
                            message: 'Provider request failed',
                        },
                    },
                }),
            ],
            [
                'OpenAI insufficient quota code',
                apiCallError({
                    statusCode: 429,
                    data: {
                        error: {
                            type: 'insufficient_quota',
                            code: 'insufficient_quota',
                            message: 'Provider request failed',
                        },
                    },
                }),
            ],
            [
                'OpenAI insufficient quota after retries',
                new RetryError({
                    message: 'Failed after 3 attempts',
                    reason: 'maxRetriesExceeded',
                    errors: [
                        apiCallError({
                            statusCode: 429,
                            data: {
                                error: {
                                    type: 'insufficient_quota',
                                    code: 'insufficient_quota',
                                    message: 'Provider request failed',
                                },
                            },
                        }),
                    ],
                }),
            ],
            ['HTTP 402', apiCallError({ statusCode: 402 })],
            [
                'Anthropic billing console referenced without credit balance phrasing',
                new APICallError({
                    message:
                        'Please go to Plans & Billing to upgrade or purchase credits.',
                    url: 'https://api.anthropic.com/v1/messages',
                    requestBodyValues: {},
                    statusCode: 400,
                }),
            ],
            [
                'Anthropic legacy credit balance shape (400 invalid_request_error)',
                new APICallError({
                    message:
                        'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
                    url: 'https://api.anthropic.com/v1/messages',
                    requestBodyValues: {},
                    statusCode: 400,
                    data: {
                        type: 'error',
                        error: {
                            type: 'invalid_request_error',
                            message:
                                'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
                        },
                    },
                }),
            ],
        ])(
            'shows actionable billing guidance for self-managed keys: %s',
            (_name, error) => {
                expect(
                    getUserFacingErrorMessage(
                        error,
                        'Custom fallback',
                        'self-managed',
                    ),
                ).toBe(PROVIDER_BILLING_MESSAGE);
            },
        );

        it('does not expose provider billing errors for Lightdash-managed keys', () => {
            expect(
                getUserFacingErrorMessage(
                    apiCallError({
                        data: {
                            type: 'error',
                            error: {
                                type: 'billing_error',
                                message: 'Provider request failed',
                            },
                        },
                    }),
                    'Custom fallback',
                    'lightdash-managed',
                ),
            ).toBe('Custom fallback');
        });

        it('does not expose the credit balance error for Lightdash-managed keys', () => {
            expect(
                getUserFacingErrorMessage(
                    new APICallError({
                        message:
                            'Your credit balance is too low to access the Anthropic API.',
                        url: 'https://api.anthropic.com/v1/messages',
                        requestBodyValues: {},
                        statusCode: 400,
                    }),
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

describe('unknown user-facing errors', () => {
    const setup = (category = 'permissions', confidence = 0.99) => {
        const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
            Response.json({
                model: 'test',
                answers: {
                    category: {
                        type: 'choice',
                        choice: category,
                        confidence,
                        probabilities: { [category]: 1 },
                    },
                },
            }),
        );
        const decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            fetcher,
        );
        return { decisions, fetcher };
    };

    it('shares one classification between concurrent handlers within a turn', async () => {
        const { decisions, fetcher } = setup();
        const resolve = createUserFacingErrorResolver({ decisions });
        const error = new Error('The role cannot read this resource');
        const replies = await Promise.all([
            resolve(error, 'first fallback'),
            resolve(error, 'second fallback'),
        ]);
        expect(replies[0]).toContain('Check your permissions');
        expect(replies[0]).toBe(replies[1]);
        expect(fetcher).toHaveBeenCalledOnce();
        await createUserFacingErrorResolver({ decisions })(error);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('keeps caller fallbacks when classification is uncertain', async () => {
        const { decisions, fetcher } = setup('permissions', 0.7);
        const resolve = createUserFacingErrorResolver({ decisions });
        const error = new Error('Request rejected');
        expect(await resolve(error, 'first fallback')).toBe('first fallback');
        expect(await resolve(error, 'second fallback')).toBe('second fallback');
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it.each([
        new AiAgentStepCapReachedError(10),
        new AiAgentEmptyResponseError('stop', 3),
        new Error('context_length_exceeded'),
        new Error('rate limit exceeded'),
        new Error('Request timeout'),
        new Error('MCP HTTP Transport Error: HTTP 401 Unauthorized'),
    ])('skips semantic classification for a known error: %s', async (error) => {
        const { decisions, fetcher } = setup();
        expect(await createUserFacingErrorResolver({ decisions })(error)).toBe(
            getUserFacingErrorMessage(error),
        );
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('preserves fallback and skips classification after cancellation', async () => {
        const { decisions, fetcher } = setup();
        expect(
            await createUserFacingErrorResolver({ decisions })(
                new DOMException('cancelled', 'AbortError'),
                'cancelled fallback',
            ),
        ).toBe('cancelled fallback');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('skips classification of known managed-provider billing failures', async () => {
        const { decisions, fetcher } = setup();
        const error = new APICallError({
            message: 'Request failed',
            url: 'https://provider.example.com',
            requestBodyValues: {},
            statusCode: 402,
        });
        expect(
            await createUserFacingErrorResolver({
                decisions,
                keyManagement: 'lightdash-managed',
            })(error, 'managed fallback'),
        ).toBe('managed fallback');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it.each(['self-managed', 'lightdash-managed'] as const)(
        'respects %s billing guidance for an unknown provider error',
        async (keyManagement) => {
            const { decisions } = setup('billing');
            expect(
                await createUserFacingErrorResolver({
                    decisions,
                    keyManagement,
                })(new Error('Balance exhausted'), 'managed fallback'),
            ).toBe(
                keyManagement === 'self-managed'
                    ? PROVIDER_BILLING_MESSAGE
                    : 'managed fallback',
            );
        },
    );

    it('uses fixed MCP copy without inventing an OAuth authorization requirement', async () => {
        const { decisions } = setup();
        const error = new McpRuntimeError(
            new Error('Remote account lacks the required role'),
        );
        expect(await createUserFacingErrorResolver({ decisions })(error)).toBe(
            MCP_PERMISSION_MESSAGE,
        );
        expect(getUserFacingErrorMessage(error)).toBe(MCP_CONNECTION_MESSAGE);
    });

    it('retains the existing MCP fallback when decisions are disabled or unavailable', async () => {
        const error = new McpRuntimeError(new Error('Unknown problem'));
        expect(await createUserFacingErrorResolver({})(error)).toBe(
            MCP_CONNECTION_MESSAGE,
        );
        const { decisions, fetcher } = setup();
        fetcher.mockRejectedValue(new Error('offline'));
        expect(await createUserFacingErrorResolver({ decisions })(error)).toBe(
            MCP_CONNECTION_MESSAGE,
        );
    });

    it.each([401, 403, 429])(
        'uses provider status %i without a classifier call',
        async (statusCode) => {
            const { decisions, fetcher } = setup();
            const error = new APICallError({
                message: 'Provider request failed',
                url: 'https://provider.example.com',
                requestBodyValues: {},
                statusCode,
            });
            const resolve = createUserFacingErrorResolver({
                decisions,
                keyManagement: 'self-managed',
            });
            expect(await resolve(error)).toBe(
                getKnownUserFacingErrorMessage(error, 'self-managed'),
            );
            expect(
                await createUserFacingErrorResolver({})(
                    error,
                    'legacy fallback',
                ),
            ).toBe('legacy fallback');
            expect(fetcher).not.toHaveBeenCalled();
        },
    );
});
