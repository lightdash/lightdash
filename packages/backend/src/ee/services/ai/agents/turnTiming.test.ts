import { describe, expect, it } from 'vitest';
import { TurnTimingTracker } from './turnTiming';

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
});
