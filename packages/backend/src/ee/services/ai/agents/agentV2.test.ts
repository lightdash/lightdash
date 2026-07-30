import * as Sentry from '@sentry/node';
import type { ModelMessage } from 'ai';
import { DeepResearchInvestigationTargetReachedError } from '../deepResearchErrors';
import type { AiAgentArgs, AiAgentDependencies } from '../types/aiAgent';
import {
    buildDeepResearchExecutionContextSnapshot,
    buildForcedFirstStep,
    buildMessagesWithMemoryBlock,
    classifyDeepResearchRetry,
    closeDeepResearchMcpClients,
    getAgentTools,
    getDeepResearchBudgetInstruction,
    getDeepResearchGenerationOptions,
    getDeepResearchRetryBackoffMs,
    getDeepResearchStopCondition,
    hasValidToolCall,
    normalizeToolOutput,
    withDeepResearchRequestTimeout,
    withEarlyToolProgress,
    type AgentMcpToolSetup,
} from './agentV2';

vi.mock('@sentry/node', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/node')>()),
    startSpan: vi.fn(
        (
            _options: unknown,
            callback: (span: {
                setAttributes: (values: unknown) => void;
            }) => unknown | Promise<unknown>,
        ) => callback({ setAttributes: vi.fn() }),
    ),
    startSpanManual: vi.fn(
        (
            _options: unknown,
            callback: (
                span: { setAttributes: (values: unknown) => void },
                finish: () => void,
            ) => unknown,
        ) => callback({ setAttributes: vi.fn() }, vi.fn()),
    ),
}));

describe('Deep Research generation controls', () => {
    const providerResult = {
        usage: {
            inputTokens: { total: 10 },
            outputTokens: { total: 4 },
        },
    } as never;

    const buildArgs = (
        phase: 'investigation' | 'synthesis',
        model: AiAgentArgs['model'] = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
        } as never,
    ) =>
        ({
            model,
            execution: {
                mode: 'deep_research',
                runUuid: 'run-1',
                phase,
            },
        }) as AiAgentArgs;

    beforeEach(() => {
        vi.mocked(Sentry.startSpan).mockReset();
        vi.mocked(Sentry.startSpan).mockImplementation(((
            _options: unknown,
            callback: (span: {
                setAttributes: (values: unknown) => void;
            }) => unknown | Promise<unknown>,
        ) => callback({ setAttributes: vi.fn() })) as typeof Sentry.startSpan);
        vi.mocked(Sentry.startSpanManual).mockReset();
        vi.mocked(Sentry.startSpanManual).mockImplementation(((
            _options: unknown,
            callback: (
                span: { setAttributes: (values: unknown) => void },
                finish: () => void,
            ) => unknown,
        ) =>
            callback(
                { setAttributes: vi.fn() },
                vi.fn(),
            )) as typeof Sentry.startSpanManual);
    });

    it('limits retries and each complete step while preserving investigation tools', () => {
        const options = getDeepResearchGenerationOptions(
            buildArgs('investigation'),
        );

        expect(options).toMatchObject({
            maxRetries: 0,
            timeout: { stepMs: 8 * 60 * 1_000 },
        });
        expect(options.activeTools).toBeUndefined();
    });

    it('restricts synthesis to the report tool', () => {
        const options = getDeepResearchGenerationOptions(
            buildArgs('synthesis'),
        );

        expect(options.activeTools).toEqual(['submitResearchReport']);
    });

    it('keeps standard agent generation unchanged', () => {
        expect(
            getDeepResearchGenerationOptions({
                execution: { mode: 'standard' },
            } as AiAgentArgs),
        ).toEqual({});
    });

    it('merges caller cancellation into a fresh timeout for every provider attempt', async () => {
        const seenSignals: AbortSignal[] = [];
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi.fn(
                async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
                    if (abortSignal) {
                        seenSignals.push(abortSignal);
                    }
                    return providerResult;
                },
            ),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model);
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }
        const controller = new AbortController();

        await wrappedModel.doGenerate({
            abortSignal: controller.signal,
        } as never);
        await wrappedModel.doGenerate({
            abortSignal: controller.signal,
        } as never);
        controller.abort();

        expect(seenSignals).toHaveLength(2);
        expect(seenSignals[0]).not.toBe(seenSignals[1]);
        expect(seenSignals.every((signal) => signal.aborted)).toBe(true);
    });

    it('aborts an individual provider attempt at its request timeout', async () => {
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi.fn(
                ({ abortSignal }: { abortSignal?: AbortSignal }) =>
                    new Promise<never>((_resolve, reject) => {
                        abortSignal?.addEventListener(
                            'abort',
                            () => reject(abortSignal.reason),
                            { once: true },
                        );
                    }),
            ),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model, 5);
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await expect(
            wrappedModel.doGenerate({} as never),
        ).rejects.toMatchObject({
            name: 'TimeoutError',
        });
        expect(model.doGenerate).toHaveBeenCalledTimes(2);
    });

    it('aborts stalled provider streams with a fresh signal and retries a timeout only once', async () => {
        const seenSignals: AbortSignal[] = [];
        const abortedSignals: AbortSignal[] = [];
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doStream: vi.fn(
                async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
                    if (!abortSignal) {
                        throw new Error('Expected a provider abort signal');
                    }
                    seenSignals.push(abortSignal);

                    return {
                        stream: new ReadableStream({
                            start(controller) {
                                abortSignal.addEventListener(
                                    'abort',
                                    () => {
                                        abortedSignals.push(abortSignal);
                                        controller.error(abortSignal.reason);
                                    },
                                    { once: true },
                                );
                            },
                        }),
                    };
                },
            ),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model, 5);
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await expect(wrappedModel.doStream({} as never)).rejects.toMatchObject({
            name: 'TimeoutError',
        });

        expect(model.doStream).toHaveBeenCalledTimes(2);
        expect(seenSignals).toHaveLength(2);
        expect(seenSignals[0]).not.toBe(seenSignals[1]);
        expect(abortedSignals).toEqual(seenSignals);
        expect(seenSignals.every((signal) => signal.aborted)).toBe(true);
    });

    it('records the first provider byte when the first stream chunk arrives', async () => {
        const spanAttributes: Record<string, unknown>[] = [];
        const finish = vi.fn();
        vi.mocked(Sentry.startSpanManual).mockImplementation(((
            _options: unknown,
            callback: (
                span: {
                    setAttributes: (
                        attributes: Record<string, unknown>,
                    ) => void;
                },
                finishSpan: () => void,
            ) => unknown,
        ) =>
            callback(
                {
                    setAttributes: (attributes) => {
                        spanAttributes.push(attributes);
                    },
                },
                finish,
            )) as typeof Sentry.startSpanManual);
        let providerController:
            | ReadableStreamDefaultController<unknown>
            | undefined;
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doStream: vi.fn().mockResolvedValue({
                stream: new ReadableStream({
                    start(controller) {
                        providerController = controller;
                        controller.enqueue({
                            type: 'response-metadata',
                            id: 'response-1',
                        });
                    },
                }),
            }),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model, 1_000, {
            runUuid: 'research-run-1',
            phase: 'investigation',
        });
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        const resultPromise = wrappedModel.doStream({} as never);

        await vi.waitFor(() =>
            expect(spanAttributes).toContainEqual({
                'ai.deep_research.first_byte_at': expect.any(String),
                'ai.deep_research.first_byte_observed': true,
            }),
        );
        expect(finish).not.toHaveBeenCalled();
        providerController?.enqueue({
            type: 'finish',
            usage: {
                inputTokens: { total: 10 },
                outputTokens: { total: 4 },
            },
            finishReason: {
                unified: 'stop',
                raw: 'stop',
            },
        });
        providerController?.close();

        const result = await resultPromise;
        await result.stream.pipeTo(new WritableStream());

        expect(finish).toHaveBeenCalledOnce();
        expect(spanAttributes).toContainEqual(
            expect.objectContaining({
                'ai.deep_research.outcome': 'success',
                'ai.deep_research.input_tokens': 10,
                'ai.deep_research.output_tokens': 4,
                'ai.deep_research.total_tokens': 14,
            }),
        );
    });

    it('preserves transient retries when Deep Research uses provider streaming', async () => {
        vi.useFakeTimers();
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doStream: vi
                .fn()
                .mockRejectedValueOnce({
                    statusCode: 503,
                    isRetryable: true,
                })
                .mockRejectedValueOnce({
                    statusCode: 503,
                    isRetryable: true,
                })
                .mockResolvedValue({
                    stream: new ReadableStream({
                        start(controller) {
                            controller.enqueue({
                                type: 'response-metadata',
                                id: 'response-1',
                            });
                            controller.close();
                        },
                    }),
                }),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model, 1_000, {
            runUuid: 'research-run-1',
            phase: 'investigation',
        });
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        const resultPromise = wrappedModel.doStream({} as never);
        await vi.runAllTimersAsync();
        const result = await resultPromise;
        await result.stream.pipeTo(new WritableStream());

        expect(model.doStream).toHaveBeenCalledTimes(3);
        vi.useRealTimers();
    });

    it('retries transient provider failures at most twice', async () => {
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi
                .fn()
                .mockRejectedValueOnce({
                    statusCode: 503,
                    isRetryable: true,
                })
                .mockRejectedValueOnce({
                    statusCode: 503,
                    isRetryable: true,
                })
                .mockResolvedValue(providerResult),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model);
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await expect(wrappedModel.doGenerate({} as never)).resolves.toBe(
            providerResult,
        );
        expect(model.doGenerate).toHaveBeenCalledTimes(3);
    });

    it.each([
        {
            error: { statusCode: 401, isRetryable: true },
            label: 'authentication',
        },
        {
            error: { name: 'InvalidResponseDataError', isRetryable: true },
            label: 'schema validation',
        },
        {
            error: { statusCode: 400, isRetryable: false },
            label: 'invalid request',
        },
    ])('does not retry $label failures', async ({ error }) => {
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi.fn().mockRejectedValue(error),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model);
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await expect(wrappedModel.doGenerate({} as never)).rejects.toBe(error);
        expect(model.doGenerate).toHaveBeenCalledOnce();
    });

    it('classifies nested ETIMEDOUT failures for only one retry', () => {
        expect(
            classifyDeepResearchRetry({
                cause: { code: 'ETIMEDOUT' },
            }),
        ).toEqual({
            reason: 'provider_timeout',
            maxRetries: 1,
        });
    });

    it('retries ETIMEDOUT only once and never retries caller cancellation', async () => {
        const timeoutError = {
            message: 'socket timed out',
            cause: { code: 'ETIMEDOUT' },
        };
        const timedOutModel = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi.fn().mockRejectedValue(timeoutError),
        } as unknown as AiAgentArgs['model'];
        const wrappedTimedOutModel =
            withDeepResearchRequestTimeout(timedOutModel);
        if (wrappedTimedOutModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await expect(wrappedTimedOutModel.doGenerate({} as never)).rejects.toBe(
            timeoutError,
        );
        expect(timedOutModel.doGenerate).toHaveBeenCalledTimes(2);

        const controller = new AbortController();
        const cancellation = new Error('cancelled');
        controller.abort(cancellation);
        const cancelledModel = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi.fn(
                ({ abortSignal }: { abortSignal?: AbortSignal }) =>
                    Promise.reject(abortSignal?.reason),
            ),
        } as unknown as AiAgentArgs['model'];
        const wrappedCancelledModel =
            withDeepResearchRequestTimeout(cancelledModel);
        if (wrappedCancelledModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await expect(
            wrappedCancelledModel.doGenerate({
                abortSignal: controller.signal,
            } as never),
        ).rejects.toBe(cancellation);
        expect(cancelledModel.doGenerate).toHaveBeenCalledOnce();
    });

    it('emits retry reason and a new attempt id for every provider retry', async () => {
        const spanAttributes: Record<string, unknown>[] = [];
        const spanOptions: Record<string, unknown>[] = [];
        const startSpan = vi.mocked(Sentry.startSpan);
        const captureSpan = ((
            options: Record<string, unknown>,
            callback: (span: unknown) => unknown,
        ) => {
            spanOptions.push(options);
            return callback({
                setAttributes: (attributes: Record<string, unknown>) => {
                    spanAttributes.push(attributes);
                },
            });
        }) as unknown as typeof Sentry.startSpan;
        startSpan.mockImplementation(captureSpan);
        const transientError = { statusCode: 503, isRetryable: true };
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi
                .fn()
                .mockRejectedValueOnce(transientError)
                .mockResolvedValue(providerResult),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model, 1_000, {
            runUuid: 'research-run-1',
            phase: 'investigation',
        });
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await wrappedModel.doGenerate({} as never);

        expect(spanAttributes[0]).toMatchObject({
            'ai.deep_research.retry_reason': 'provider_transient',
            'ai.deep_research.will_retry': true,
        });
        expect(
            spanOptions
                .filter(
                    (options) =>
                        options.name === 'ai.deep_research.provider_attempt',
                )
                .map(
                    (options) =>
                        (options.attributes as Record<string, unknown>)[
                            'ai.deep_research.attempt_id'
                        ],
                ),
        ).toEqual([
            'research-run-1:investigation:1:1',
            'research-run-1:investigation:1:2',
        ]);
    });

    it('emits correlated provider-attempt telemetry with exclusive latency phases', async () => {
        const spanAttributes: Record<string, unknown>[] = [];
        const startSpan = vi.mocked(Sentry.startSpan);
        startSpan.mockImplementationOnce(((
            options: unknown,
            callback: (span: unknown) => unknown,
        ) =>
            callback({
                setAttributes: (attributes: Record<string, unknown>) => {
                    spanAttributes.push(attributes);
                },
                options,
            })) as typeof Sentry.startSpan);
        const model = {
            specificationVersion: 'v3',
            provider: 'test',
            modelId: 'test',
            supportedUrls: {},
            doGenerate: vi.fn().mockResolvedValue(providerResult),
        } as unknown as AiAgentArgs['model'];
        const wrappedModel = withDeepResearchRequestTimeout(model, 1_000, {
            runUuid: 'research-run-1',
            phase: 'synthesis',
        });
        if (wrappedModel.specificationVersion !== 'v3') {
            throw new Error('Expected a v3 model');
        }

        await wrappedModel.doGenerate({} as never);

        expect(startSpan).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'ai.deep_research.provider_attempt',
                attributes: expect.objectContaining({
                    'ai.deep_research.run_uuid': 'research-run-1',
                    'ai.deep_research.step_id': 'research-run-1:synthesis:1',
                    'ai.deep_research.attempt_id':
                        'research-run-1:synthesis:1:1',
                    'ai.deep_research.started_at': expect.any(String),
                }),
            }),
            expect.any(Function),
        );
        expect(spanAttributes).toEqual([
            expect.objectContaining({
                'ai.deep_research.outcome': 'success',
                'ai.deep_research.ended_at': expect.any(String),
                'ai.deep_research.input_tokens': 10,
                'ai.deep_research.output_tokens': 4,
                'ai.deep_research.total_tokens': 14,
            }),
        ]);
        expect(startSpan).toHaveBeenCalledWith(
            expect.objectContaining({
                attributes: expect.objectContaining({
                    'ai.deep_research.latency_phase': 'synthesis',
                    'ai.deep_research.first_byte_observed': false,
                }),
            }),
            expect.any(Function),
        );
    });

    it('uses bounded exponential retry backoff', () => {
        expect([1, 2, 3, 4, 5, 20].map(getDeepResearchRetryBackoffMs)).toEqual([
            250, 500, 1_000, 2_000, 2_000, 2_000,
        ]);
    });

    it('records valid and invalid report submissions as tool-execution phases', async () => {
        const spanOptions: Record<string, unknown>[] = [];
        const spanAttributes: Record<string, unknown>[] = [];
        vi.mocked(Sentry.startSpan).mockImplementation(((
            options: Record<string, unknown>,
            callback: (span: unknown) => unknown,
        ) => {
            spanOptions.push(options);
            return callback({
                setAttributes: (attributes: Record<string, unknown>) => {
                    spanAttributes.push(attributes);
                },
            });
        }) as unknown as typeof Sentry.startSpan);
        const updateProgress = vi.fn().mockResolvedValue(undefined);
        const tools = withEarlyToolProgress(
            {
                submitResearchReport: {
                    execute: vi
                        .fn()
                        .mockResolvedValueOnce({
                            result: 'accepted',
                            metadata: { status: 'success' },
                        })
                        .mockResolvedValueOnce({
                            result: 'rejected',
                            metadata: { status: 'error' },
                        }),
                },
            } as never,
            updateProgress,
            true,
            {
                runUuid: 'research-run-1',
                workflowPhase: 'synthesis',
            },
        );

        await tools.submitResearchReport.execute?.({}, {
            toolCallId: 'report-1',
        } as never);
        await tools.submitResearchReport.execute?.({}, {
            toolCallId: 'report-2',
        } as never);

        expect(spanOptions).toEqual([
            expect.objectContaining({
                name: 'ai.deep_research.tool_execution',
                attributes: expect.objectContaining({
                    'ai.deep_research.run_uuid': 'research-run-1',
                    'ai.deep_research.latency_phase': 'tool_execution',
                    'ai.deep_research.step_id': 'report-1',
                }),
            }),
            expect.objectContaining({
                name: 'ai.deep_research.tool_execution',
                attributes: expect.objectContaining({
                    'ai.deep_research.step_id': 'report-2',
                }),
            }),
        ]);
        expect(spanAttributes).toEqual([
            expect.objectContaining({
                'ai.deep_research.report_submission': 'valid',
            }),
            expect.objectContaining({
                'ai.deep_research.report_submission': 'invalid',
            }),
        ]);
    });

    it('records Deep Research cleanup without changing standard cleanup', async () => {
        const spanOptions: Record<string, unknown>[] = [];
        vi.mocked(Sentry.startSpan).mockImplementationOnce(((
            options: Record<string, unknown>,
            callback: (span: unknown) => unknown,
        ) => {
            spanOptions.push(options);
            return callback({ setAttributes: vi.fn() });
        }) as unknown as typeof Sentry.startSpan);
        const closeMcpClients = vi.fn().mockResolvedValue(undefined);

        await closeDeepResearchMcpClients({
            context: {
                runUuid: 'research-run-1',
                workflowPhase: 'investigation',
            },
            closeMcpClients,
        });

        expect(closeMcpClients).toHaveBeenCalledOnce();
        expect(spanOptions[0]).toMatchObject({
            name: 'ai.deep_research.cleanup',
            attributes: {
                'ai.deep_research.run_uuid': 'research-run-1',
                'ai.deep_research.workflow_phase': 'investigation',
                'ai.deep_research.latency_phase': 'cleanup',
                'ai.deep_research.step_id': 'cleanup',
                'ai.deep_research.attempt_id': 'cleanup:1',
                'ai.deep_research.tokens_available': false,
            },
        });
    });

    it('releases Deep Research cleanup after five seconds when an MCP client stalls', async () => {
        vi.useFakeTimers();
        const setAttributes = vi.fn();
        vi.mocked(Sentry.startSpan).mockImplementationOnce(((
            _options: Record<string, unknown>,
            callback: (span: unknown) => unknown,
        ) =>
            callback({ setAttributes })) as unknown as typeof Sentry.startSpan);

        try {
            const cleanup = closeDeepResearchMcpClients({
                context: {
                    runUuid: 'research-run-1',
                    workflowPhase: 'investigation',
                },
                closeMcpClients: () => new Promise<void>(() => {}),
            });

            await vi.advanceTimersByTimeAsync(5_000);
            await expect(cleanup).resolves.toBeUndefined();
            expect(setAttributes).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    'ai.deep_research.outcome': 'timeout',
                    'ai.deep_research.aborted': true,
                }),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops only for a successfully validated report', () => {
        const stop = hasValidToolCall('submitResearchReport');

        expect(
            stop({
                steps: [
                    {
                        toolCalls: [
                            {
                                toolName: 'submitResearchReport',
                            },
                        ],
                        toolResults: [
                            {
                                toolName: 'submitResearchReport',
                                output: {
                                    result: 'Invalid report',
                                    metadata: { status: 'error' },
                                },
                            },
                        ],
                    },
                ],
            } as never),
        ).toBe(false);
        expect(
            stop({
                steps: [
                    {
                        toolCalls: [
                            {
                                toolName: 'submitResearchReport',
                            },
                        ],
                        toolResults: [
                            {
                                toolName: 'submitResearchReport',
                                output: {
                                    result: JSON.stringify({
                                        submitted: true,
                                    }),
                                    metadata: { status: 'success' },
                                },
                            },
                        ],
                    },
                ],
            } as never),
        ).toBe(true);
    });

    it.each([
        {
            role: 'planner',
            toolName: 'submitResearchHypotheses',
        },
        {
            role: 'investigator',
            toolName: 'submitInvestigationReport',
        },
        {
            role: 'judge',
            toolName: 'submitResearchReport',
        },
    ] as const)(
        'stops a $role phase after a valid $toolName submission and allows invalid output to be repaired',
        ({ role, toolName }) => {
            const stop = getDeepResearchStopCondition({
                execution: {
                    mode: 'deep_research',
                    research: { role },
                },
            } as AiAgentArgs);
            const buildStep = (status: 'success' | 'error') => ({
                steps: [
                    {
                        toolCalls: [{ toolName }],
                        toolResults: [
                            {
                                toolName,
                                output: {
                                    result:
                                        status === 'success'
                                            ? JSON.stringify({
                                                  submitted: true,
                                              })
                                            : 'Invalid submission',
                                    metadata: { status },
                                },
                            },
                        ],
                    },
                ],
            });

            expect(stop).not.toBeNull();
            expect(stop?.(buildStep('error') as never)).toBe(false);
            expect(stop?.(buildStep('success') as never)).toBe(true);
        },
    );
});

describe('getDeepResearchBudgetInstruction', () => {
    it('advertises only enforceable Deep Research limits', () => {
        const instruction = getDeepResearchBudgetInstruction({
            maxToolCalls: 20,
            maxWarehouseQueries: 10,
            maxResultRows: 1_000,
            maxHypotheses: 2,
        });

        expect(instruction).toContain('20 tool calls');
        expect(instruction).toContain('10 warehouse queries');
        expect(instruction).toContain('1000 rows per query result');
        expect(instruction).not.toContain('token');
    });
});

describe('buildForcedFirstStep', () => {
    it('forces the hinted report tool on only the opening step', () => {
        const prepareStep = buildForcedFirstStep(
            {
                execution: {
                    mode: 'standard',
                    maxSteps: 10,
                },
                forceToolHints: true,
                toolHints: ['submitResearchReport'],
            } as AiAgentArgs,
            {
                submitResearchReport: {} as never,
            },
        );

        expect(prepareStep?.({ stepNumber: 0 })).toEqual({
            toolChoice: {
                type: 'tool',
                toolName: 'submitResearchReport',
            },
        });
        expect(prepareStep?.({ stepNumber: 1 })).toEqual({});
    });

    it('forces report submission on the opening synthesis step', () => {
        const prepareStep = buildForcedFirstStep(
            {
                execution: {
                    mode: 'deep_research',
                    phase: 'synthesis',
                },
                forceToolHints: false,
                toolHints: [],
            } as unknown as AiAgentArgs,
            {
                submitResearchReport: {} as never,
            },
        );

        expect(prepareStep?.({ stepNumber: 0 })).toEqual({
            toolChoice: {
                type: 'tool',
                toolName: 'submitResearchReport',
            },
        });
        expect(prepareStep?.({ stepNumber: 1 })).toEqual({});
    });

    it('reserves the final investigator step for report submission', () => {
        const prepareStep = buildForcedFirstStep(
            {
                execution: {
                    mode: 'deep_research',
                    phase: 'investigation',
                    maxSteps: 3,
                    research: {
                        role: 'investigator',
                    },
                },
                forceToolHints: false,
                toolHints: [],
            } as unknown as AiAgentArgs,
            {
                submitInvestigationReport: {} as never,
            },
        );

        expect(prepareStep?.({ stepNumber: 0 })).toEqual({});
        expect(prepareStep?.({ stepNumber: 1 })).toEqual({});
        expect(prepareStep?.({ stepNumber: 2 })).toEqual({
            activeTools: ['submitInvestigationReport'],
            toolChoice: {
                type: 'tool',
                toolName: 'submitInvestigationReport',
            },
        });
    });
});

describe('buildDeepResearchExecutionContextSnapshot', () => {
    it('captures the effective runtime without secret-bearing fields', () => {
        const snapshot = buildDeepResearchExecutionContextSnapshot(
            {
                agentSettings: {
                    uuid: 'agent-1',
                    name: 'Research agent',
                    version: 4,
                    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
                    instruction:
                        'Use https://secret.example/token-sensitive-path',
                    tags: ['analytics'],
                    spaceAccess: ['space-1'],
                    enableDataAccess: true,
                    enableSelfImprovement: false,
                    enableContentTools: true,
                    enableUserContext: false,
                },
                model: {
                    provider: 'anthropic',
                    modelId: 'claude-sonnet',
                },
                modelReasoningEnabled: true,
                keyManagement: 'self-managed',
                mcpServers: [
                    {
                        uuid: 'mcp-1',
                        name: 'GitHub',
                        url: 'https://secret.example/mcp',
                        resolvedCredential: {
                            type: 'bearer',
                            token: 'never-store-this',
                        },
                    },
                ],
                knowledgeDocuments: [
                    {
                        uuid: 'document-1',
                        name: 'Definitions',
                        updatedAt: new Date('2026-07-24T08:00:00.000Z'),
                        alwaysIncludeInContext: true,
                        content: 'never store document contents',
                    },
                ],
                projectContextEnabled: true,
                enableAiWriteback: false,
                enableCodingAgent: false,
                enablePreviewDeploySetup: false,
                enableRepoDiscovery: true,
                repoFsRoot: 'dbt',
                repoFsSupportsCodeSearch: true,
                availableSkills: [{ name: 'modeling' }],
                canManageAgent: false,
                canRunSql: true,
                enableDataAccess: true,
                enableContentTools: true,
                autoApproveSql: true,
            } as unknown as AiAgentArgs,
            {
                generateVisualization: {} as never,
                mcp_github__search_issues: {} as never,
            },
            {
                tools: {
                    mcp_github__search_issues: {} as never,
                },
                mcpToolNameToServerUuid: {
                    mcp_github__search_issues: 'mcp-1',
                },
                unavailableMcpServers: [],
                closeMcpClients: () => Promise.resolve(),
            },
        );

        expect(snapshot).toMatchObject({
            schemaVersion: 1,
            resolutionStage: 'execution',
            model: {
                provider: 'anthropic',
                modelName: 'claude-sonnet',
                reasoningEnabled: true,
                keyManagement: 'self-managed',
            },
            tools: {
                availableToolNames: [
                    'generateVisualization',
                    'mcp_github__search_issues',
                ],
                selectedMcpServers: [
                    {
                        uuid: 'mcp-1',
                        name: 'GitHub',
                        enabledToolNames: ['mcp_github__search_issues'],
                    },
                ],
            },
            knowledgeDocuments: [
                {
                    uuid: 'document-1',
                    name: 'Definitions',
                    alwaysIncludeInContext: true,
                },
            ],
        });
        expect(JSON.stringify(snapshot)).not.toContain('never-store-this');
        expect(JSON.stringify(snapshot)).not.toContain('secret.example');
        expect(JSON.stringify(snapshot)).not.toContain(
            'never store document contents',
        );
    });
});

describe('normalizeToolOutput', () => {
    it('preserves built-in tool output result and metadata', () => {
        expect(
            normalizeToolOutput({
                result: 'ok',
                metadata: { status: 'success' },
            }),
        ).toEqual({
            result: 'ok',
            metadata: { status: 'success' },
        });
    });

    it('stores plain-text MCP output', () => {
        expect(normalizeToolOutput('plain text')).toEqual({
            result: 'plain text',
        });
    });

    it('stores structured MCP output as JSON text', () => {
        const output = {
            content: [{ type: 'text', text: 'hello' }],
        };

        expect(normalizeToolOutput(output)).toEqual({
            result: JSON.stringify(output),
        });
    });

    it('always returns a string result for empty MCP output', () => {
        expect(normalizeToolOutput(undefined)).toEqual({
            result: 'undefined',
        });
    });
});

describe('withEarlyToolProgress', () => {
    const finalOutput = {
        result: 'done',
        metadata: { status: 'success' },
    };
    const streamingTool = {
        async *execute() {
            yield {
                result: '',
                metadata: { status: 'streaming' },
            };
            yield finalOutput;
        },
    };

    it('resolves an async iterable tool to its final output after durable progress', async () => {
        let resolveProgress: () => void = () => undefined;
        const updateProgress = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveProgress = resolve;
                }),
        );
        const execute = vi.fn(streamingTool.execute);
        const tools = withEarlyToolProgress(
            { discoverFields: { execute } } as never,
            updateProgress,
            true,
        );

        const execution = tools.discoverFields.execute?.({}, {
            toolCallId: 'tool-call-1',
        } as never);
        expect(execute).not.toHaveBeenCalled();

        resolveProgress();

        await expect(execution).resolves.toEqual(finalOutput);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('returns a tool error without executing when the investigation target is reached', async () => {
        const execute = vi.fn().mockResolvedValue(finalOutput);
        const tools = withEarlyToolProgress(
            { runSql: { execute } } as never,
            vi
                .fn()
                .mockRejectedValue(
                    new DeepResearchInvestigationTargetReachedError(
                        'Deep Research reached its investigation warehouse-query target',
                    ),
                ),
            true,
        );

        const execution = tools.runSql.execute?.({}, {
            toolCallId: 'tool-call-16',
        } as never);

        await expect(execution).resolves.toEqual({
            result: 'Deep Research reached its investigation warehouse-query target',
            metadata: { status: 'error' },
        });
        expect(execute).not.toHaveBeenCalled();
    });

    it('preserves async iterable tools in the standard execution path', () => {
        const tools = withEarlyToolProgress(
            { discoverFields: streamingTool } as never,
            vi.fn().mockResolvedValue(undefined),
            false,
        );

        const execution = tools.discoverFields.execute?.({}, {
            toolCallId: 'tool-call-1',
        } as never);

        expect(
            (execution as AsyncIterable<unknown>)[Symbol.asyncIterator],
        ).toBeTypeOf('function');
    });
});

// Change B: the workstream tools (listWorkstreams, closePullRequest) are shared
// by the general coding agent (editRepo) and the dbt-writeback agent
// (editDbtProject). Both can now drive several PRs per thread, so the gate
// widened from `enableCodingAgent` to `enableCodingAgent || enableAiWriteback`.
describe('getAgentTools workstream tool gate', () => {
    // Tool factories only capture their inputs at construction, so a Proxy that
    // hands back a fresh vi.fn() for every dependency access is enough to build
    // the whole tool set without enumerating all ~46 dependencies.
    const depsStub = () =>
        new Proxy({}, { get: () => vi.fn() }) as unknown as AiAgentDependencies;

    const mcpStub: AgentMcpToolSetup = {
        tools: {},
        mcpToolNameToServerUuid: {},
        unavailableMcpServers: [],
        closeMcpClients: () => Promise.resolve(),
    };

    const buildArgs = (flags: {
        enableCodingAgent: boolean;
        enableAiWriteback: boolean;
        aiAgentMemoryEnabled?: boolean;
    }): AiAgentArgs =>
        ({
            agentSettings: { name: 'test-agent' },
            autoApproveSql: false,
            autoApproveSqlUserUuid: null,
            availableSkills: [],
            callOptions: {},
            canManageAgent: false,
            canRunSql: true,
            debugLoggingEnabled: false,
            enableContentTools: false,
            enableDataAccess: false,
            enableEditProjectContext: false,
            enableGrepFields: false,
            enablePreviewDeploySetup: false,
            enableRepoDiscovery: false,
            execution: {
                mode: 'standard',
                maxSteps: 10,
            },
            findExploresFieldSearchSize: 10,
            findFieldsPageSize: 10,
            getDashboardChartsPageSize: 10,
            maxQueryLimit: 5000,
            model: {},
            organizationId: 'org-1',
            aiAgentMemoryEnabled: false,
            projectContextEnabled: false,
            promptUuid: 'prompt-1',
            providerOptions: {},
            runSqlMaxLimit: 5000,
            siteUrl: 'http://localhost',
            telemetryEnabled: false,
            threadUuid: 'thread-1',
            toolDescriptionMaxChars: 1000,
            userId: 'user-1',
            useSlackStreamCard: false,
            ...flags,
        }) as unknown as AiAgentArgs;

    const toolNames = (flags: {
        enableCodingAgent: boolean;
        enableAiWriteback: boolean;
        aiAgentMemoryEnabled?: boolean;
    }) =>
        Object.keys(
            getAgentTools(buildArgs(flags), depsStub(), [], mcpStub, new Map()),
        );

    it('exposes listWorkstreams + closePullRequest when AI writeback is enabled (coding agent off)', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: true,
        });
        expect(names).toContain('listWorkstreams');
        expect(names).toContain('closePullRequest');
        expect(names).toContain('getPullRequestDiff');
        expect(names).toContain('editDbtProject');
        expect(names).not.toContain('editRepo');
    });

    it('exposes loadProjectContext when AI agent memory is enabled', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            aiAgentMemoryEnabled: true,
        });

        expect(names).toContain('loadProjectContext');
    });

    it('still exposes them for the general coding agent (writeback off) — unchanged', () => {
        const names = toolNames({
            enableCodingAgent: true,
            enableAiWriteback: false,
        });
        expect(names).toContain('listWorkstreams');
        expect(names).toContain('closePullRequest');
        expect(names).toContain('getPullRequestDiff');
        expect(names).toContain('editRepo');
    });

    it('omits them when neither coding agent nor writeback is enabled', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
        });
        expect(names).not.toContain('listWorkstreams');
        expect(names).not.toContain('closePullRequest');
        expect(names).not.toContain('getPullRequestDiff');
    });

    it('exposes read-only or SELECT-validated built-ins and annotated MCP tools in deep research', () => {
        const args = buildArgs({
            enableCodingAgent: false,
            enableAiWriteback: true,
        });
        args.execution = {
            mode: 'deep_research',
            runUuid: 'run-1',
            phase: 'investigation',
            maxSteps: 30,
            budget: {
                maxToolCalls: 20,
                maxWarehouseQueries: 10,
                maxResultRows: 1_000,
                maxHypotheses: 2,
            },
            initialTokenUsage: 0,
        };
        const tools = getAgentTools(
            args,
            depsStub(),
            [],
            {
                ...mcpStub,
                tools: {
                    mcp_github__search_issues: {} as never,
                    mcp_github__create_issue: {} as never,
                },
                readOnlyMcpToolNames: new Set(['mcp_github__search_issues']),
            },
            new Map(),
        );

        expect(Object.keys(tools)).toEqual(
            expect.arrayContaining([
                'submitResearchReport',
                'runSql',
                'mcp_github__search_issues',
            ]),
        );
        expect(tools).not.toHaveProperty('editDbtProject');
        expect(tools).not.toHaveProperty('generateVisualization');
        expect(tools).not.toHaveProperty('mcp_github__create_issue');
    });
});

describe('getAgentMessages memory injection', () => {
    const systemPrompt: ModelMessage = {
        role: 'system',
        content: 'Cached system prompt',
        providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
        },
    };
    const messageHistory: ModelMessage[] = [
        { role: 'user', content: 'Question' },
    ];

    it('injects an uncached user message immediately after the system prompt', () => {
        const withoutBlock = buildMessagesWithMemoryBlock({
            systemPrompt,
            messageHistory,
            memoryEnabled: true,
            memoryBlock: null,
        });
        const withBlock = buildMessagesWithMemoryBlock({
            systemPrompt,
            messageHistory,
            memoryEnabled: true,
            memoryBlock: '<ld-memories></ld-memories>',
        });

        expect(withBlock[0]).toEqual(withoutBlock[0]);
        expect(withBlock[0]).toBe(systemPrompt);
        expect(withBlock[1]).toEqual({
            role: 'user',
            content: '<ld-memories></ld-memories>',
        });
        expect(withBlock[1]).not.toHaveProperty('providerOptions');
        expect(withBlock[2]).toEqual({ role: 'user', content: 'Question' });
    });

    it.each([
        { memoryEnabled: false, block: '<ld-memories></ld-memories>' },
        { memoryEnabled: true, block: null },
    ])(
        'does not inject for disabled or empty memory',
        ({ memoryEnabled, block }) => {
            const messages = buildMessagesWithMemoryBlock({
                systemPrompt,
                messageHistory,
                memoryEnabled,
                memoryBlock: block,
            });

            expect(messages).toHaveLength(2);
            expect(messages[1]).toEqual({ role: 'user', content: 'Question' });
        },
    );
});
