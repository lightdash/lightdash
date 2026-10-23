import type { WarehousePhaseTimings } from '@lightdash/common';
import type { Attributes } from '@opentelemetry/api';
import { performance } from 'perf_hooks';
import { traceSpan, type TraceSpan } from '../../tracing/tracing';

export const COMPOSER_QUERY_STAGES = {
    python: [
        'wait_references',
        'read_inputs',
        'create',
        'compile',
        'write_inputs',
        'run',
        'read_output',
        'destroy',
        'validate_output',
        'upload_result',
        'total',
    ],
    duckdb: [
        'queue_wait',
        'wait_references',
        'bind_references',
        'resolve_columns',
        'execute',
        'upload',
        'total',
    ],
} as const;

export type ComposerQuerySource = keyof typeof COMPOSER_QUERY_STAGES;

export type ComposerQueryStage<S extends ComposerQuerySource> =
    (typeof COMPOSER_QUERY_STAGES)[S][number];

export type ComposerQueryStageMetrics = {
    observeComposerQueryStageDuration<S extends ComposerQuerySource>(
        source: S,
        stage: ComposerQueryStage<S>,
        durationMs: number,
    ): void;
};

/** One timing feeds both the span and the stage histogram, on success or failure. */
export const traceComposerQueryStage = <S extends ComposerQuerySource, T>(
    metrics: ComposerQueryStageMetrics | null | undefined,
    source: S,
    stage: ComposerQueryStage<S>,
    options: { name: string; op?: string; attributes: Attributes },
    fn: (span: TraceSpan) => Promise<T>,
): Promise<T> =>
    traceSpan(
        {
            op: options.op ?? options.name,
            name: options.name,
            attributes: options.attributes,
        },
        async (span) => {
            const startedAt = performance.now();
            try {
                return await fn(span);
            } finally {
                metrics?.observeComposerQueryStageDuration(
                    source,
                    stage,
                    performance.now() - startedAt,
                );
            }
        },
    );

/** Stages timed inside the shared warehouse execution tail. */
export type ComposerStageTimedCallback = (
    stage: Extract<ComposerQueryStage<'duckdb'>, 'execute' | 'upload'>,
    durationMs: number,
) => void;

export const setPhaseTimingAttributes = (
    span: TraceSpan | undefined,
    phaseTimings: WarehousePhaseTimings,
) => {
    Object.entries(phaseTimings).forEach(([phase, durationMs]) => {
        if (durationMs !== undefined) {
            span?.setAttribute(
                `lightdash.phase.${phase}Ms`,
                Math.round(durationMs),
            );
        }
    });
};
