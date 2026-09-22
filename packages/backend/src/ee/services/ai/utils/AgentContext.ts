import type { Explore } from '@lightdash/common';
import { AnswerEvidence } from '../decisions/answerEvidence';
import type { ChartExportSource } from './chartAsCode';
import { GeneratedResponseBlocks } from './GeneratedResponseBlocks';

type AgentStage = 'query' | 'api' | 'render';

/**
 * Type-safe wrapper for experimental_context from AI SDK
 *
 * Provides validated access to context data passed to tool execution functions,
 * avoiding unsafe type casts.
 *
 * @example
 * ```typescript
 * // Create context instance
 * const context = new AgentContext({ availableExplores });
 *
 * // Pass it in experimental_context
 * experimental_context: context
 *
 * // Use in tool
 * execute: async (args, { experimental_context: context }) => {
 *   const ctx = AgentContext.from(context);
 *   const explore = ctx.getExplore('users');
 * }
 * ```
 */
export class AgentContext {
    previousQueryUuid: string | undefined;

    clearPreviousQuery(): void {
        this.previousQueryUuid = undefined;
    }
    readonly answerEvidence: AnswerEvidence | undefined;
    readonly responseBlocks = new GeneratedResponseBlocks();

    private readonly chartExports = new Map<string, ChartExportSource>();

    constructor(
        private readonly availableExplores: Explore[],
        verifyAnswers = false,
        private readonly recordStageSpan?: (
            stage: AgentStage,
            startedAt: number,
            durationMs: number,
        ) => void,
    ) {
        this.answerEvidence = verifyAnswers ? new AnswerEvidence() : undefined;
    }

    async measureStage<T>(
        stage: AgentStage,
        run: () => Promise<T>,
    ): Promise<T> {
        const startedAt = Date.now();
        try {
            return await run();
        } finally {
            this.recordStageSpan?.(stage, startedAt, Date.now() - startedAt);
        }
    }

    registerChartExport(queryUuid: string, chart: ChartExportSource): void {
        if (this.chartExports.size >= 20 && !this.chartExports.has(queryUuid)) {
            const oldest = this.chartExports.keys().next().value;
            if (oldest !== undefined) this.chartExports.delete(oldest);
        }
        this.chartExports.set(queryUuid, structuredClone(chart));
    }

    getChartExport(queryUuid: string): ChartExportSource {
        const chart = this.chartExports.get(queryUuid);
        if (!chart) {
            throw new Error(
                'No exportable chart for this query in the current turn. For an earlier chart, call exportChartAsCode with null queryUuid, artifactUuid and versionUuid to list stored charts. Do not rerun its data query just to export it.',
            );
        }
        return structuredClone(chart);
    }

    /**
     * Creates a validated AgentContext from unknown context
     *
     * @param context - Raw context from experimental_context
     * @returns AgentContext instance with type-safe access methods
     * @throws {Error} If context validation fails
     */
    static from(context: unknown): AgentContext {
        if (!(context instanceof AgentContext)) {
            throw new Error(
                'Invalid agent context: expected AgentContext instance',
            );
        }

        return context;
    }

    /**
     * Gets available explores from context
     */
    getAvailableExplores(): Explore[] {
        return this.availableExplores;
    }

    /**
     * Gets a specific explore by name from available explores
     *
     * @param exploreName - Name of the explore to get
     * @returns The explore
     * @throws {Error} If explore not found
     */
    getExplore(exploreName: string): Explore {
        const explore = this.availableExplores.find(
            (e) => e.name === exploreName,
        );

        if (!explore) {
            throw new Error(`Explore '${exploreName}' not found`);
        }

        return explore;
    }
}
