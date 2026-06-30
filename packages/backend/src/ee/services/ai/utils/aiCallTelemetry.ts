/**
 * Coarse feature bucket for an AI call. Lets us attribute token usage and cost
 * to a product surface (data apps vs the agent vs metadata generation, etc.) in
 * tracing, independently of the fine-grained `functionId`.
 */
export type AiCallFeature =
    | 'agent'
    | 'agent-subtask'
    | 'chart-metadata'
    | 'document-summary'
    | 'thread-title'
    | 'tooltip'
    | 'artifact-question'
    | 'agent-suggestions'
    | 'table-calc'
    | 'formula-table-calc'
    | 'compaction'
    | 'embedding'
    | 'project-router'
    | 'agent-selector'
    | 'review-classifier'
    | 'llm-judge'
    | 'data-app'
    | 'managed-agent';

/**
 * Attribution dimensions stamped on an AI-call span. All optional because not
 * every call site has every dimension (e.g. an org-level router has no thread),
 * but `organizationUuid` + `projectUuid` should be set wherever they're in scope
 * so spend can be sliced by customer instance and project.
 */
export type AiCallAttribution = {
    organizationUuid?: string | null;
    projectUuid?: string | null;
    agentUuid?: string | null;
    threadUuid?: string | null;
    promptUuid?: string | null;
    userUuid?: string | null;
    model?: string | null;
};

export type AiCallTelemetryOptions = AiCallAttribution & {
    functionId: string;
    feature: AiCallFeature;
    /**
     * Record the prompt/response content on the span. Gated separately from span
     * emission because content can contain user data — emission (token usage +
     * attribution) is always on, content capture is opt-in.
     */
    recordIO?: boolean;
    /** Extra span metadata (e.g. a mode flag). Nullish values are dropped. */
    extra?: Record<string, string | number | boolean | null | undefined>;
};

const ATTRIBUTION_KEYS: (keyof AiCallAttribution)[] = [
    'organizationUuid',
    'projectUuid',
    'agentUuid',
    'threadUuid',
    'promptUuid',
    'userUuid',
    'model',
];

/**
 * Builds an `experimental_telemetry` config for any Vercel AI SDK call
 * (generateText / streamText / generateObject / embed).
 *
 * Spans always emit (`isEnabled: true`) so token usage is never silently lost;
 * only input/output content capture is gated (`recordIO`). The metadata pins
 * each call to a `feature` + org/project (+ agent/thread/prompt where available)
 * so token usage and cost can be attributed in tracing. Nullish dimensions are
 * dropped so the AI SDK doesn't reject the metadata.
 */
export const getAiCallTelemetry = ({
    functionId,
    feature,
    recordIO = false,
    extra,
    ...attribution
}: AiCallTelemetryOptions) => {
    const metadata: Record<string, string | number | boolean> = { feature };

    ATTRIBUTION_KEYS.forEach((key) => {
        const value = attribution[key];
        if (value != null) {
            metadata[key] = value;
        }
    });

    if (extra) {
        Object.entries(extra).forEach(([key, value]) => {
            if (value != null) {
                metadata[key] = value;
            }
        });
    }

    return {
        functionId,
        isEnabled: true,
        recordInputs: recordIO,
        recordOutputs: recordIO,
        metadata,
    } as const;
};

/**
 * Convenience wrapper for generator-style calls that carry their attribution on
 * `modelOptions.telemetry`. Structural param (not `GeneratorModelOptions`) to
 * avoid an import cycle with the models package.
 */
export const getGeneratorTelemetry = (
    modelOptions: { telemetry?: AiCallAttribution },
    functionId: string,
    feature: AiCallFeature,
) =>
    getAiCallTelemetry({
        functionId,
        feature,
        ...(modelOptions.telemetry ?? {}),
    });
