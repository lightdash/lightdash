import { wrapLanguageModel, type LanguageModel } from 'ai';

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
    stage: ToolStage;
    queryCacheHit: boolean;
};

export type ToolStage = 'query' | 'api' | 'render';

export type TurnStageTiming = {
    preparationMs: number;
    providerMs: number | null;
    queryMs: number;
    apiMs: number;
    renderMs: number;
    queryCacheHits: number;
};

const QUERY_TOOLS = new Set([
    'runQuery',
    'runMetricQuery',
    'runSavedChart',
    'runContentQuery',
    'runSql',
    'runComposerQueries',
]);

const RENDER_TOOLS = new Set([
    'generateVisualization',
    'generateDashboardV2',
    'generateDataApp',
    'iterateDataApp',
    'exportChartAsCode',
]);

export const getToolStage = (toolName: string): ToolStage => {
    if (QUERY_TOOLS.has(toolName)) return 'query';
    if (RENDER_TOOLS.has(toolName)) return 'render';
    return 'api';
};

const intervalUnionMs = (
    intervals: Array<{ startedAt: number; durationMs: number }>,
): number => {
    if (intervals.length === 0) return 0;
    const sorted = [...intervals].sort((a, b) => a.startedAt - b.startedAt);
    let start = sorted[0].startedAt;
    let end = start + sorted[0].durationMs;
    let total = 0;
    for (const interval of sorted.slice(1)) {
        const nextEnd = interval.startedAt + interval.durationMs;
        if (interval.startedAt > end) {
            total += end - start;
            start = interval.startedAt;
            end = nextEnd;
        } else {
            end = Math.max(end, nextEnd);
        }
    }
    return total + end - start;
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

    private preparationFinishedAt: number | null = null;

    private readonly completedSteps: StepTiming[] = [];

    private readonly providerCalls: Array<{
        stepIndex: number;
        durationMs: number;
    }> = [];

    private readonly completedToolCalls: ToolCallTiming[] = [];

    private readonly explicitStageSpans: Array<{
        stage: ToolStage;
        startedAt: number;
        durationMs: number;
    }> = [];

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

    recordPreparationFinished(): void {
        if (this.preparationFinishedAt !== null) return;
        this.preparationFinishedAt = this.now();
        // The first model step starts after preparation; keep preparation out
        // of provider inference while retaining its turn-relative offset.
        if (
            this.stepIndex === 0 &&
            this.stepFirstChunkAt === null &&
            this.stepFirstToolCallAt === null &&
            this.completedSteps.length === 0
        ) {
            this.stepStartedAt = this.preparationFinishedAt;
        }
    }

    async measureProviderCall<T>(call: () => PromiseLike<T>): Promise<T> {
        const startedAt = this.now();
        const { stepIndex } = this;
        try {
            return await call();
        } finally {
            this.providerCalls.push({
                stepIndex,
                durationMs: this.now() - startedAt,
            });
        }
    }

    recordStageSpan(
        stage: ToolStage,
        startedAt: number,
        durationMs: number,
    ): void {
        this.explicitStageSpans.push({ stage, startedAt, durationMs });
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
    recordToolCallEnd(
        toolCallId: string,
        queryCacheHit = false,
    ): ToolCallTiming | null {
        const open = this.openToolCalls.get(toolCallId);
        if (!open) {
            return null;
        }
        this.openToolCalls.delete(toolCallId);
        const timing = {
            toolCallId,
            toolName: open.toolName,
            stepIndex: open.stepIndex,
            startedAt: open.startedAt,
            durationMs: this.now() - open.startedAt,
            stage: getToolStage(open.toolName),
            queryCacheHit,
        };
        this.completedToolCalls.push(timing);
        return timing;
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
        const providerCalls = this.providerCalls.filter(
            (call) => call.stepIndex === this.stepIndex,
        );

        let inferenceMs = splitUnobservable
            ? null
            : (this.stepFirstToolCallAt ?? finishedAt) - this.stepStartedAt;
        if (providerCalls.length > 0) {
            inferenceMs = providerCalls.reduce(
                (total, call) => total + call.durationMs,
                0,
            );
        }
        const timing: StepTiming = {
            stepIndex: this.stepIndex,
            stepOffsetMs: this.stepStartedAt - this.turnStartedAt,
            stepTotalMs: finishedAt - this.stepStartedAt,
            inferenceMs,
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

        this.completedSteps.push(timing);
        return timing;
    }

    getStageTiming(): TurnStageTiming {
        const observableInference = this.completedSteps.map(
            ({ inferenceMs }) => inferenceMs,
        );
        const unfinishedProviderMs = this.providerCalls
            .filter((call) => call.stepIndex === this.stepIndex)
            .reduce((total, call) => total + call.durationMs, 0);
        const providerMs = observableInference.every(
            (duration): duration is number => duration !== null,
        )
            ? observableInference.reduce(
                  (total, duration) => total + duration,
                  unfinishedProviderMs,
              )
            : null;
        const stageMs = (stage: ToolStage) => {
            const explicit = this.explicitStageSpans.filter(
                (span) => span.stage === stage,
            );
            return intervalUnionMs(
                explicit.length > 0
                    ? explicit
                    : this.completedToolCalls.filter(
                          (call) => call.stage === stage,
                      ),
            );
        };
        return {
            preparationMs:
                (this.preparationFinishedAt ?? this.now()) - this.turnStartedAt,
            providerMs,
            queryMs: stageMs('query'),
            apiMs: stageMs('api'),
            renderMs: stageMs('render'),
            queryCacheHits: this.completedToolCalls.filter(
                ({ queryCacheHit }) => queryCacheHit,
            ).length,
        };
    }
}

export const withNonStreamingProviderTiming = (
    model: Exclude<LanguageModel, string>,
    timing: TurnTimingTracker,
) => {
    // Older adapters retain tool-boundary timing without changing their protocol.
    if (model.specificationVersion !== 'v3') return model;
    return wrapLanguageModel({
        model,
        middleware: {
            specificationVersion: 'v3',
            wrapGenerate: ({ doGenerate }) =>
                timing.measureProviderCall(doGenerate),
        },
    });
};
