import type { ModelMessage } from 'ai';
import { AiDecisionClient } from './AiDecisionClient';
import {
    classifyUnknownError,
    errorDecisionText,
    type ErrorDomain,
} from './errorClassification';
import { queryErrorOverride } from './queryErrors';

const decisionClient = (
    category: string,
    { confidence = 0.99, probability = 0.99, repairable = 0.01 } = {},
) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
        Response.json({
            model: 'test',
            answers: {
                category: {
                    type: 'choice',
                    choice: category,
                    confidence,
                    probabilities: {
                        [category]: probability,
                        other: 1 - probability,
                    },
                },
                repairable: { type: 'noul', noul: repairable },
            },
        }),
    );
    return {
        fetcher,
        decisions: new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            fetcher,
        ),
    };
};

describe('unknown error classification', () => {
    it.each(['query', 'response', 'mcp'] as ErrorDomain[])(
        'uses a bounded, credential-redacted message for %s errors',
        async (domain) => {
            const { decisions, fetcher } = decisionClient('permissions');
            const error = Object.assign(
                new Error(
                    'Request rejected; authorization: Bearer secret-token; api_key="key-secret"; password=pw-secret; https://user:pw@server/path?token=url-secret',
                ),
                {
                    requestBodyValues: { secret: 'body-secret' },
                    headers: { authorization: 'header-secret' },
                },
            );
            expect(
                await classifyUnknownError({ decisions, error, domain }),
            ).toBe('permissions');
            const body = String(fetcher.mock.calls[0][1]?.body);
            [
                'secret-token',
                'key-secret',
                'pw-secret',
                'url-secret',
                'body-secret',
                'header-secret',
            ].forEach((value) => expect(body).not.toContain(value));
            expect(JSON.parse(body).state.domain).toBe(domain);
            expect(body).toContain('Request rejected');
        },
    );

    it.each([
        { confidence: 0.8 },
        { probability: 0.8 },
        { repairable: 0.5 },
        { repairable: 0.99 },
    ])(
        'does not stop a query without both confidence and unrepairability: %j',
        async (options) => {
            const { decisions } = decisionClient('permissions', options);
            expect(
                await classifyUnknownError({
                    decisions,
                    error: 'request rejected',
                    domain: 'query',
                }),
            ).toBeNull();
        },
    );

    it.each(['invented'])(
        'does not classify unsupported category %s',
        async (category) => {
            const { decisions } = decisionClient(category);
            expect(
                await classifyUnknownError({
                    decisions,
                    error: 'request rejected',
                    domain: 'query',
                }),
            ).toBeNull();
        },
    );

    it('returns a supported repairability classification without deciding recovery policy', async () => {
        const { decisions } = decisionClient('query');
        expect(
            await classifyUnknownError({
                decisions,
                error: 'request rejected',
                domain: 'query',
            }),
        ).toBe('query');
    });

    it('does not serialize an object or send an empty message', async () => {
        const { decisions, fetcher } = decisionClient('permissions');
        expect(
            await classifyUnknownError({
                decisions,
                error: { secret: 'never send' },
                domain: 'response',
            }),
        ).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
        expect(errorDecisionText(new Error('x'.repeat(8_000)))).toHaveLength(
            4_000,
        );
    });

    it('falls back when the provider is unavailable', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error('offline'));
        const decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            fetcher,
        );
        expect(
            await classifyUnknownError({
                decisions,
                error: 'failure',
                domain: 'query',
            }),
        ).toBeNull();
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it('uses Jev rather than error keywords for bounded resource recovery', async () => {
        const { decisions, fetcher } = decisionClient('resource');
        const checked = new Map<string, string | null>();
        const messages: ModelMessage[] = [];
        const addFailure = (toolCallId: string, value: string) =>
            messages.push({
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId,
                        toolName: 'runSql',
                        output: { type: 'error-text', value },
                    },
                ],
            } as ModelMessage);

        addFailure('first', 'opaque warehouse response alpha');
        const recovery = await queryErrorOverride({
            decisions,
            messages,
            checked,
            allToolNames: ['runSql', 'grepFields'],
        });
        expect(recovery?.activeTools).toContain('runSql');

        addFailure('second', 'opaque warehouse response beta');
        const stopped = await queryErrorOverride({
            decisions,
            messages,
            checked,
            allToolNames: ['runSql', 'grepFields'],
        });
        expect(stopped?.activeTools).toEqual(['grepFields']);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('does not classify AI SDK schema failures from their prose', async () => {
        const { decisions, fetcher } = decisionClient('permissions');
        const messages: ModelMessage[] = [
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'failed',
                        toolName: 'runSql',
                        output: {
                            type: 'error-text',
                            value: 'arbitrary SDK wording',
                        },
                    },
                ],
            } as ModelMessage,
        ];
        expect(
            await queryErrorOverride({
                decisions,
                messages,
                checked: new Map(),
                allToolNames: ['runSql'],
                invalidToolCallIds: new Set(['failed']),
            }),
        ).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });
});
