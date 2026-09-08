/**
 * Per-step wall-clock timing for one agent turn.
 *
 * A step's tool phase is measured as a span (first tool call -> step finish),
 * not the sum of its tool durations: the SDK runs a step's calls
 * concurrently, so summing would overcount a fan-out.
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
    /** Turn start to step start. */
    stepOffsetMs: number;
    stepTotalMs: number;
    /** Model latency. Null when the transport hid the decide/execute boundary. */
    inferenceMs: number | null;
    /** Wall time of the step's tool batch. Zero without tools, null when unobservable. */
    toolWallMs: number | null;
    ttftMs: number | null;
    toolCallCount: number;
    reasoningChars: number;
};

/** Fed by the AI SDK callbacks; holds no I/O of its own. */
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

    /** Only the first chunk of a step is retained (TTFT). */
    recordChunk(): void {
        if (this.stepFirstChunkAt === null) {
            this.stepFirstChunkAt = this.now();
        }
    }

    /** The first call of a step also closes that step's inference phase. */
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

    /** Null for a call never seen starting — better absent than fabricated. */
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

    getCurrentStepIndex(): number {
        return this.stepIndex;
    }

    /**
     * Closes the current step and opens the next. `toolCallCount` overrides
     * the tracked count for callers that learn a step's calls only once it has
     * finished, which is what marks the split unavailable.
     */
    completeStep(reasoningChars: number, toolCallCount?: number): StepTiming {
        const finishedAt = this.now();
        const calls = toolCallCount ?? this.stepToolCallCount;
        // Ran tools but nothing said when: leave the split empty rather than
        // crediting tool time to the model.
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
