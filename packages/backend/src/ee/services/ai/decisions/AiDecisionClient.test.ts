import { afterEach, describe, expect, it, vi } from 'vitest';
import Logger from '../../../../logging/logger';
import {
    AiDecisionClient,
    confidentChoice,
    resolveAiDecisionClient,
} from './AiDecisionClient';

const config = { apiKey: 'test-key', model: 'jev-1.13.0', timeoutMs: 100 };
const request = {
    operation: 'test',
    state: { question: 'Which project?' },
    questions: {
        pick: {
            type: 'choice' as const,
            instructions: 'Pick a project',
            criteria: { a: 'A', none: 'None' },
        },
    },
};
const result = {
    model: config.model,
    answers: {
        pick: {
            type: 'choice',
            choice: 'a',
            confidence: 0.98,
            probabilities: { a: 0.99, none: 0.01 },
        },
    },
};

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('AiDecisionClient', () => {
    it('validates a response and only returns a listed confident choice', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json(result));
        const client = new AiDecisionClient(config, fetcher);
        const answers = await client.evaluate(request);
        expect(confidentChoice(answers?.pick)).toBe('a');
        const options = fetcher.mock.calls[0][1];
        expect(options?.headers).toEqual({
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
        });
        expect(options?.body).toBe(
            JSON.stringify({
                model: config.model,
                state: request.state,
                questions: request.questions,
            }),
        );
    });

    it('tracks provider usage without mixing it into the decision answers', async () => {
        const usage = { inputTokens: 0, outputTokens: 0, serviceMs: null };
        const client = new AiDecisionClient(config, async () =>
            Response.json({
                ...result,
                usage: { input_tokens: 123, output_tokens: 4 },
            }),
        ).withUsage(usage);

        expect(await client.evaluate(request)).toEqual(result.answers);
        expect(usage).toEqual({
            inputTokens: 123,
            outputTokens: 4,
            serviceMs: null,
        });
    });

    it('sums the service time JEV reports across calls', async () => {
        const usage = { inputTokens: 0, outputTokens: 0, serviceMs: null };
        const client = new AiDecisionClient(config, async () =>
            Response.json(result, {
                headers: { 'x-envoy-upstream-service-time': '82' },
            }),
        ).withUsage(usage);

        await client.evaluate(request);
        await client.evaluate(request);
        expect(usage.serviceMs).toBe(164);
    });

    it.each([
        { pick: { ...result.answers.pick, choice: 'invented' } },
        { pick: { type: 'noul', noul: 0.9 } },
        { pick: { ...result.answers.pick, confidence: 1.1 } },
        {},
    ])('falls back for invalid output %j', async (answers) => {
        const client = new AiDecisionClient(config, async () =>
            Response.json({ model: config.model, answers }),
        );
        expect(await client.evaluate(request)).toBeNull();
    });

    it('opens the circuit after consecutive failures and probes after cooldown', async () => {
        vi.useFakeTimers();
        const fetcher = vi
            .fn<typeof fetch>()
            .mockImplementation(
                async () => new Response(null, { status: 503 }),
            );
        const client = new AiDecisionClient(config, fetcher);
        for (let i = 0; i < 5; i += 1)
            // Serial failures exercise the circuit opening before later calls.
            // eslint-disable-next-line no-await-in-loop
            expect(await client.evaluate(request)).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(3);
        vi.advanceTimersByTime(30_001);
        fetcher.mockResolvedValueOnce(Response.json(result));
        expect(await client.evaluate(request)).not.toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(4);
    });

    it('does not contact the provider without credentials or after cancellation', async () => {
        const fetcher = vi.fn<typeof fetch>();
        expect(
            await new AiDecisionClient(
                { ...config, apiKey: null },
                fetcher,
            ).evaluate(request),
        ).toBeNull();
        expect(
            await new AiDecisionClient(config, fetcher).evaluate({
                ...request,
                signal: AbortSignal.abort(),
            }),
        ).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('logs only a safe outcome when a provider error contains credentials', async () => {
        const debug = vi.spyOn(Logger, 'debug');
        const client = new AiDecisionClient(config, async () => {
            throw new Error(`request failed with Bearer ${config.apiKey}`);
        });

        expect(await client.evaluate(request)).toBeNull();
        const logs = JSON.stringify(debug.mock.calls);
        expect(logs).toContain('outcome=request-failed');
        expect(logs).not.toContain(config.apiKey);
        expect(logs).not.toContain('Bearer');
    });

    it.each([true, false])(
        'never logs arbitrary operation or model text (success: %s)',
        async (success) => {
            const debug = vi.spyOn(Logger, 'debug');
            const model = 'private-model\nforged-log-entry';
            const operation = 'private-operation\nforged-log-entry';
            const client = new AiDecisionClient(
                { ...config, model },
                async () => {
                    if (!success) throw new Error('private-provider-error');
                    return Response.json(result);
                },
            );

            await client.evaluate({ ...request, operation });
            const logs = JSON.stringify(debug.mock.calls);
            expect(logs).toContain('AI agent decision: unknown,');
            expect(logs).not.toContain('private-');
            expect(logs).not.toContain('forged-log-entry');
        },
    );

    it('preserves allowlisted operation timing', async () => {
        const debug = vi.spyOn(Logger, 'debug');
        const client = new AiDecisionClient(config, async () =>
            Response.json(result),
        );
        await client.evaluate({ ...request, operation: 'model-routing' });
        expect(debug).toHaveBeenCalledWith(
            expect.stringMatching(
                /^AI agent decision: model-routing, outcome=success, durationMs=\d+$/,
            ),
        );
    });

    it('bounds state and option counts before sending', async () => {
        const fetcher = vi.fn<typeof fetch>();
        const client = new AiDecisionClient(config, fetcher);
        expect(
            await client.evaluate({ ...request, state: 'x'.repeat(100_001) }),
        ).toBeNull();
        expect(
            await client.evaluate({
                ...request,
                questions: {
                    pick: {
                        ...request.questions.pick,
                        criteria: Object.fromEntries(
                            Array.from({ length: 256 }, (_, i) => [
                                String(i),
                                null,
                            ]),
                        ),
                    },
                },
            }),
        ).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('rejects an oversized provider response before parsing it', async () => {
        const client = new AiDecisionClient(config, async () =>
            Response.json({ padding: 'x'.repeat(100_001) }),
        );
        await expect(client.evaluate(request)).resolves.toBeNull();
    });

    it('does not open the provider circuit for non-retryable responses', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 400 }));
        const client = new AiDecisionClient(config, fetcher);
        for (let i = 0; i < 4; i += 1)
            // Serial calls prove tenant-specific bad input cannot trip the
            // shared provider-availability circuit.
            // eslint-disable-next-line no-await-in-loop
            await client.evaluate(request);
        expect(fetcher).toHaveBeenCalledTimes(4);
    });

    it('does not confuse confidence with option probability', () => {
        expect(
            confidentChoice({
                type: 'choice',
                choice: 'a',
                confidence: 0.99,
                probabilities: { a: 0.6, none: 0.4 },
            }),
        ).toBeNull();
    });

    it('aborts a slow request at its deadline and falls back', async () => {
        const fetcher = vi.fn<typeof fetch>().mockImplementation(
            (_url, options) =>
                new Promise((_resolve, reject) => {
                    options?.signal?.addEventListener(
                        'abort',
                        () => reject(options.signal?.reason),
                        { once: true },
                    );
                }),
        );
        const client = new AiDecisionClient(
            { ...config, timeoutMs: 20 },
            fetcher,
        );
        await expect(client.evaluate(request)).resolves.toBeNull();
        expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });

    it('rejects impossible distributions and scores outside the rubric', async () => {
        const client = new AiDecisionClient(config, async () =>
            Response.json({
                model: 'test',
                answers: {
                    pick: {
                        ...result.answers.pick,
                        probabilities: { a: 0.99, none: 0.99 },
                    },
                    score: { type: 'score', score: 8, confidence: 0.99 },
                },
            }),
        );
        expect(await client.evaluate(request)).toBeNull();
        expect(
            await client.evaluate({
                ...request,
                questions: {
                    score: {
                        type: 'score',
                        instructions: 'Rate',
                        criteria: ['low', 'high'],
                    },
                },
            }),
        ).toBeNull();
    });

    it.each([
        { a: 0.98, none: 0.01 },
        { a: 0.99, none: 0.02 },
    ])(
        'accepts observed two-decimal rounding without raising certainty: %j',
        async (probabilities) => {
            const client = new AiDecisionClient(config, async () =>
                Response.json({
                    ...result,
                    answers: {
                        pick: { ...result.answers.pick, probabilities },
                    },
                }),
            );
            const answers = await client.evaluate(request);
            expect(answers?.pick.type).toBe('choice');
            if (answers?.pick.type !== 'choice')
                throw new Error('Expected choice');
            expect(answers.pick.probabilities.a).toBeLessThanOrEqual(
                probabilities.a,
            );
            expect(
                Object.values(answers.pick.probabilities).reduce(
                    (sum, value) => sum + value,
                    0,
                ),
            ).toBeLessThanOrEqual(1);
            expect(confidentChoice(answers.pick, 0.95)).toBe('a');
        },
    );

    it.each([{ a: 0.99 }, { a: 0.99, none: 0.04 }, { a: 0.985, none: 0.005 }])(
        'rejects missing options and drift that rounding cannot explain: %j',
        async (probabilities) => {
            const client = new AiDecisionClient(config, async () =>
                Response.json({
                    ...result,
                    answers: {
                        pick: { ...result.answers.pick, probabilities },
                    },
                }),
            );
            expect(await client.evaluate(request)).toBeNull();
        },
    );
    it('preserves exact sparse distributions where omitted options have zero mass', async () => {
        const client = new AiDecisionClient(config, async () =>
            Response.json({
                ...result,
                answers: {
                    pick: { ...result.answers.pick, probabilities: { a: 1 } },
                },
            }),
        );
        expect(confidentChoice((await client.evaluate(request))?.pick)).toBe(
            'a',
        );
    });
});

describe('decision client rollout resolution', () => {
    const decisionConfig = {
        apiKey: 'decisionConfigured',
        model: 'test',
        timeoutMs: 100,
    };
    it('shares outage backoff across requests without sharing it across config instances', async () => {
        const fetcher = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(
                async () => new Response(null, { status: 503 }),
            );
        const sharedConfig = { ...decisionConfig };
        const getFlag = vi.fn().mockResolvedValue({ enabled: true });

        for (let i = 0; i < 4; i += 1) {
            // Resolve as separate requests to exercise shared circuit state.
            // eslint-disable-next-line no-await-in-loop
            const client = await resolveAiDecisionClient(sharedConfig, getFlag);
            // eslint-disable-next-line no-await-in-loop
            expect(await client?.evaluate(request)).toBeNull();
        }
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(getFlag).toHaveBeenCalledTimes(4);

        fetcher.mockResolvedValueOnce(Response.json(result));
        const independent = await resolveAiDecisionClient(
            { ...sharedConfig },
            getFlag,
        );
        expect(await independent?.evaluate(request)).not.toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(4);
    });

    it('keeps the legacy path without credentials or when resolution fails', async () => {
        const getFlag = vi.fn().mockRejectedValue(new Error('unavailable'));
        expect(
            await resolveAiDecisionClient(undefined, getFlag),
        ).toBeUndefined();
        expect(getFlag).not.toHaveBeenCalled();
        expect(
            await resolveAiDecisionClient(decisionConfig, getFlag),
        ).toBeUndefined();
    });
    it('rechecks on every request and supports disable and re-enable without restart', async () => {
        const getFlag = vi
            .fn()
            .mockResolvedValueOnce({ enabled: false })
            .mockResolvedValueOnce({ enabled: true })
            .mockResolvedValueOnce({ enabled: false })
            .mockResolvedValueOnce({ enabled: true });
        expect(
            await resolveAiDecisionClient(decisionConfig, getFlag),
        ).toBeUndefined();
        const enabled = await resolveAiDecisionClient(decisionConfig, getFlag);
        expect(enabled).toBeInstanceOf(AiDecisionClient);
        expect(
            await resolveAiDecisionClient(decisionConfig, getFlag),
        ).toBeUndefined();
        expect(await resolveAiDecisionClient(decisionConfig, getFlag)).toBe(
            enabled,
        );
        expect(getFlag).toHaveBeenCalledTimes(4);
    });
});
