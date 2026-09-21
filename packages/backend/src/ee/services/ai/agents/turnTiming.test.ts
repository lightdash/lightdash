import { generateText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    TurnTimingTracker,
    withNonStreamingProviderTiming,
} from './turnTiming';

/** Deterministic clock: each advance() moves wall time forward by `ms`. */
const clock = (start: number) => {
    let t = start;
    return {
        now: () => t,
        advance: (ms: number) => {
            t += ms;
        },
    };
};

describe('TurnTimingTracker', () => {
    it('observes real SDK provider and failing tool boundaries without changing the response', async () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);
        let calls = 0;
        const model = new MockLanguageModelV3({
            doGenerate: async () => {
                calls += 1;
                c.advance(100);
                return {
                    content:
                        calls === 1
                            ? [
                                  {
                                      type: 'tool-call' as const,
                                      toolCallId: 'query',
                                      toolName: 'runQuery',
                                      input: '{}',
                                  },
                              ]
                            : [
                                  {
                                      type: 'text' as const,
                                      text: 'Query failed.',
                                  },
                              ],
                    finishReason: {
                        unified:
                            calls === 1
                                ? ('tool-calls' as const)
                                : ('stop' as const),
                        raw: undefined,
                    },
                    usage: {
                        inputTokens: {
                            total: 1,
                            noCache: 1,
                            cacheRead: 0,
                            cacheWrite: 0,
                        },
                        outputTokens: { total: 1, text: 1, reasoning: 0 },
                    },
                    warnings: [],
                };
            },
        });
        tracker.recordPreparationFinished();
        const result = await generateText({
            model: withNonStreamingProviderTiming(model, tracker),
            prompt: 'Count orders',
            stopWhen: stepCountIs(2),
            tools: {
                runQuery: tool({
                    inputSchema: z.object({}),
                    execute: async (): Promise<string> => {
                        c.advance(40);
                        throw new Error('unknown field');
                    },
                }),
            },
            experimental_onToolCallStart: ({ toolCall }) => {
                tracker.recordToolCallStart(
                    toolCall.toolCallId,
                    toolCall.toolName,
                );
            },
            experimental_onToolCallFinish: (event) => {
                expect(event.success).toBe(false);
                tracker.recordToolCallEnd(event.toolCall.toolCallId);
            },
            onStepFinish: (step) => {
                tracker.completeStep(0, step.toolCalls.length);
            },
        });
        expect(result.text).toBe('Query failed.');
        expect(tracker.getStageTiming()).toMatchObject({
            providerMs: 200,
            queryMs: 40,
        });
    });
    it('measures provider calls separately from retries, tools and bookkeeping', async () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);
        tracker.recordPreparationFinished();
        await expect(
            tracker.measureProviderCall(async () => {
                c.advance(100);
                throw new Error('retry');
            }),
        ).rejects.toThrow('retry');
        c.advance(50); // SDK retry backoff
        await tracker.measureProviderCall(async () => {
            c.advance(200);
        });
        tracker.recordToolCallStart('query', 'runQuery');
        c.advance(500);
        tracker.recordToolCallEnd('query');
        c.advance(20); // persistence
        expect(tracker.completeStep(0, 1)).toMatchObject({
            inferenceMs: 300,
            stepTotalMs: 870,
        });
        expect(tracker.getStageTiming()).toMatchObject({
            providerMs: 300,
            queryMs: 500,
        });
        await tracker.measureProviderCall(async () => {
            c.advance(80);
        });
        expect(tracker.completeStep(0, 0).inferenceMs).toBe(80);
        expect(tracker.getStageTiming().providerMs).toBe(380);
    });

    it('retains provider time when generation fails before a step completes', async () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);
        await expect(
            tracker.measureProviderCall(async () => {
                c.advance(100);
                throw new Error('aborted');
            }),
        ).rejects.toThrow('aborted');
        expect(tracker.getStageTiming().providerMs).toBe(100);
    });
    it('reports a tool-free step as inference end to end', () => {
        const c = clock(1_000);
        const tracker = new TurnTimingTracker(1_000, c.now);

        c.advance(200);
        tracker.recordChunk();
        c.advance(800);

        const step = tracker.completeStep(0);

        expect(step).toMatchObject({
            stepIndex: 0,
            stepOffsetMs: 0,
            stepTotalMs: 1_000,
            inferenceMs: 1_000,
            toolWallMs: 0,
            ttftMs: 200,
            toolCallCount: 0,
        });
    });

    it('splits a step at its first tool call', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        c.advance(3_000); // model thinking
        tracker.recordToolCallStart('call-1', 'grepFields');
        c.advance(500); // tool running
        tracker.recordToolCallEnd('call-1');
        const step = tracker.completeStep(0);

        expect(step.inferenceMs).toBe(3_000);
        expect(step.toolWallMs).toBe(500);
        expect(step.stepTotalMs).toBe(3_500);
    });

    it('counts concurrent tool calls as one wall-time span, not a sum', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        c.advance(2_000);
        // Three calls emitted together, all still running.
        tracker.recordToolCallStart('a', 'runMetricQuery');
        tracker.recordToolCallStart('b', 'runMetricQuery');
        tracker.recordToolCallStart('c', 'runMetricQuery');

        c.advance(1_000);
        const a = tracker.recordToolCallEnd('a');
        c.advance(1_000);
        const b = tracker.recordToolCallEnd('b');
        c.advance(1_000);
        const cc = tracker.recordToolCallEnd('c');

        const step = tracker.completeStep(0);

        expect([a?.durationMs, b?.durationMs, cc?.durationMs]).toEqual([
            1_000, 2_000, 3_000,
        ]);
        // Summing the three would claim 6s; the batch only took 3s.
        expect(step.toolWallMs).toBe(3_000);
        expect(step.toolCallCount).toBe(3);
        expect(step.stepTotalMs).toBe(5_000);
    });

    it('attributes each tool call to the step that emitted it', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        tracker.recordToolCallStart('s0', 'grepFields');
        c.advance(100);
        expect(tracker.recordToolCallEnd('s0')?.stepIndex).toBe(0);
        tracker.completeStep(0);

        expect(tracker.getCurrentStepIndex()).toBe(1);
        tracker.recordToolCallStart('s1', 'getMetadata');
        c.advance(100);
        expect(tracker.recordToolCallEnd('s1')?.stepIndex).toBe(1);
    });

    it('carries a tool call spanning a step boundary with its own step', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        tracker.recordToolCallStart('slow', 'runSql');
        c.advance(500);
        tracker.completeStep(0);
        c.advance(500);

        // Resolved after its step closed — still attributed to step 0.
        const timing = tracker.recordToolCallEnd('slow');
        expect(timing).toMatchObject({ stepIndex: 0, durationMs: 1_000 });
    });

    it('returns null for a result whose call was never observed', () => {
        const tracker = new TurnTimingTracker(0, clock(0).now);
        expect(tracker.recordToolCallEnd('never-started')).toBeNull();
    });

    it('offsets successive steps from the turn start', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        c.advance(1_000);
        tracker.completeStep(0);
        c.advance(2_000);
        const second = tracker.completeStep(0);

        expect(second).toMatchObject({
            stepIndex: 1,
            stepOffsetMs: 1_000,
            stepTotalMs: 2_000,
        });
    });

    it('resets time-to-first-chunk per step', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        c.advance(100);
        tracker.recordChunk();
        c.advance(100);
        tracker.recordChunk(); // later chunks do not move TTFT
        expect(tracker.completeStep(0).ttftMs).toBe(100);

        c.advance(700);
        tracker.recordChunk();
        expect(tracker.completeStep(0).ttftMs).toBe(700);
    });

    it('leaves the split null when tools ran without observed boundaries', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        // Non-streaming transport: the step is reported only once finished,
        // with a tool-call count but no per-call timing.
        c.advance(4_000);
        const step = tracker.completeStep(0, 2);

        expect(step.stepTotalMs).toBe(4_000);
        expect(step.inferenceMs).toBeNull();
        expect(step.toolWallMs).toBeNull();
        expect(step.toolCallCount).toBe(2);
    });

    it('still reports a full split when a step genuinely ran no tools', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        c.advance(2_500);
        const step = tracker.completeStep(0, 0);

        expect(step.inferenceMs).toBe(2_500);
        expect(step.toolWallMs).toBe(0);
    });

    it('reports preparation, provider and non-overcounted stage spans', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);

        c.advance(100);
        tracker.recordPreparationFinished();
        c.advance(400);
        tracker.recordToolCallStart('query-a', 'runQuery');
        tracker.recordToolCallStart('query-b', 'runSavedChart');
        c.advance(200);
        tracker.recordToolCallEnd('query-a', true);
        c.advance(100);
        tracker.recordToolCallEnd('query-b');
        tracker.completeStep(0);

        expect(tracker.getStageTiming()).toEqual({
            preparationMs: 100,
            providerMs: 400,
            queryMs: 300,
            apiMs: 0,
            renderMs: 0,
            queryCacheHits: 1,
        });
    });

    it('separates API and render tools', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);
        tracker.recordPreparationFinished();

        tracker.recordToolCallStart('api', 'getKnowledgeDocumentContent');
        c.advance(50);
        tracker.recordToolCallEnd('api');
        tracker.recordToolCallStart('render', 'exportChartAsCode');
        c.advance(25);
        tracker.recordToolCallEnd('render');
        tracker.completeStep(0);

        expect(tracker.getStageTiming()).toMatchObject({
            apiMs: 50,
            renderMs: 25,
        });
    });

    it('uses inner query and render spans for a combined visualization tool', () => {
        const c = clock(0);
        const tracker = new TurnTimingTracker(0, c.now);
        tracker.recordPreparationFinished();
        tracker.recordToolCallStart('chart', 'generateVisualization');
        c.advance(10);
        tracker.recordStageSpan('query', 10, 60);
        c.advance(60);
        tracker.recordStageSpan('render', 70, 5);
        c.advance(5);
        tracker.recordToolCallEnd('chart');
        tracker.completeStep(0);

        expect(tracker.getStageTiming()).toMatchObject({
            queryMs: 60,
            renderMs: 5,
        });
    });
});
