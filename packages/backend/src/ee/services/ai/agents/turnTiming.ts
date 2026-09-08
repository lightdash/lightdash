/**
 * Wall-clock timing for one agent turn, sliced per loop step.
 *
 * The agent loop alternates inference and tool execution:
 *
 *   step 0: [inference ....][tool a ][tool b ]   (a and b run concurrently)
 *   step 1: [inference ..][tool c ..............]
 *   step 2: [inference .......]                  (final text, no tools)
 *
 * Totals alone cannot express that shape, and summing tool durations
 * overcounts a step whose tools ran in parallel. So each step records its own
 * boundaries and every tool call records its own start/end, keyed by step:
 * a step's tool wall time is the span from the first tool call it emitted to
 * the step finishing, which is `max` over concurrent calls by construction.
 *
 * Boundaries within a step, in the order the AI SDK reports them:
 *   stepStartedAt -> firstChunkAt (TTFT) -> ... -> firstToolCallAt -> stepFinish
 *
 * `firstToolCallAt` is the inference/tool-execution split: the model has
 * finished deciding by the time it emits a tool call, and everything after is
 * the tool batch. A step that emits no tool call is inference end to end.
 */

export type ToolCallTiming = {
    toolCallId: string;
    toolName: string;
    stepIndex: number;
    startedAt: number;
    durationMs: number;
};

export type StepTiming = {
    stepIndex: number;
    /** Turn start to step start. Locates the step on the turn's timeline. */
    stepOffsetMs: number;
    /** Step start to the step finishing. */
    stepTotalMs: number;
    /**
     * Step start to the first tool call it emitted, or the whole step when it
     * emitted none. The model's own latency for this step.
     *
     * Null when the step ran tools but the transport never surfaced the
     * boundary between deciding and executing — the non-streaming path only
     * reports a step once it is wholly finished. `stepTotalMs` still holds
     * there, so a null split narrows what the row can answer rather than
     * invalidating it.
     */
    inferenceMs: number | null;
    /**
     * First tool call to step finish — the wall time of this step's tool
     * batch, so concurrent calls count once rather than summing.
     * Zero for a step that called no tools, null when unobservable.
     */
    toolWallMs: number | null;
    /** Step start to its first streamed chunk of any kind. */
    ttftMs: number | null;
    toolCallCount: number;
    reasoningChars: number;
};

/**
 * Tracks step and tool-call boundaries across one streamed or generated turn.
 * Fed by the AI SDK callbacks; holds no I/O of its own so the agent decides
 * what to do with each completed step.
 */
export class TurnTimingTracker {
    private readonly turnStartedAt: number;

    private readonly now: () => number;

    private stepIndex = 0;

    private stepStartedAt: number;

    private stepFirstChunkAt: number | null = null;

    private stepFirstToolCallAt: number | null = null;

    private stepToolCallCount = 0;

    private readonly openToolCalls = new Map<
        string,
        { toolName: string; stepIndex: number; startedAt: number }
    >();

    constructor(turnStartedAt: number, now: () => number = Date.now) {
        this.turnStartedAt = turnStartedAt;
        this.stepStartedAt = turnStartedAt;
        this.now = now;
    }

    /** Any streamed chunk. Only the first one in a step is retained (TTFT). */
    recordChunk(): void {
        if (this.stepFirstChunkAt === null) {
            this.stepFirstChunkAt = this.now();
        }
    }

    /**
     * The model emitted a tool call. Opens the call's timer and, for the first
     * call of the step, closes the step's inference phase.
     */
    recordToolCallStart(toolCallId: string, toolName: string): void {
        const startedAt = this.now();
        if (this.stepFirstToolCallAt === null) {
            this.stepFirstToolCallAt = startedAt;
        }
        this.stepToolCallCount += 1;
        this.openToolCalls.set(toolCallId, {
            toolName,
            stepIndex: this.stepIndex,
            startedAt,
        });
    }

    /**
     * The tool returned. Returns its timing, or null for a call this tracker
     * never saw start — a result can arrive without its call chunk (a resumed
     * stream, a preliminary chunk filtered upstream), and a fabricated
     * duration would be worse than an absent one.
     */
    recordToolCallEnd(toolCallId: string): ToolCallTiming | null {
        const open = this.openToolCalls.get(toolCallId);
        if (!open) {
            return null;
        }
        this.openToolCalls.delete(toolCallId);
        return {
            toolCallId,
            toolName: open.toolName,
            stepIndex: open.stepIndex,
            startedAt: open.startedAt,
            durationMs: this.now() - open.startedAt,
        };
    }

    /** Step index the next tool call will be attributed to. */
    getCurrentStepIndex(): number {
        return this.stepIndex;
    }

    /**
     * Closes the current step and opens the next. The returned timing is the
     * step that just finished.
     *
     * `toolCallCount` overrides the tracked count for callers that learn a
     * step's tool calls only once it has finished (the non-streaming path).
     * Supplying it without any observed tool-call boundary is what marks the
     * inference/tool split unavailable.
     */
    completeStep(reasoningChars: number, toolCallCount?: number): StepTiming {
        const finishedAt = this.now();
        const calls = toolCallCount ?? this.stepToolCallCount;
        // Ran tools, but nothing told us when they started: report the step
        // total and leave the split empty rather than crediting tool time to
        // the model.
        const splitUnobservable =
            calls > 0 && this.stepFirstToolCallAt === null;

        const timing: StepTiming = {
            stepIndex: this.stepIndex,
            stepOffsetMs: this.stepStartedAt - this.turnStartedAt,
            stepTotalMs: finishedAt - this.stepStartedAt,
            inferenceMs: splitUnobservable
                ? null
                : (this.stepFirstToolCallAt ?? finishedAt) - this.stepStartedAt,
            toolWallMs: (() => {
                if (splitUnobservable) return null;
                return this.stepFirstToolCallAt === null
                    ? 0
                    : finishedAt - this.stepFirstToolCallAt;
            })(),
            ttftMs:
                this.stepFirstChunkAt === null
                    ? null
                    : this.stepFirstChunkAt - this.stepStartedAt,
            toolCallCount: calls,
            reasoningChars,
        };

        this.stepIndex += 1;
        this.stepStartedAt = finishedAt;
        this.stepFirstChunkAt = null;
        this.stepFirstToolCallAt = null;
        this.stepToolCallCount = 0;

        return timing;
    }
}
