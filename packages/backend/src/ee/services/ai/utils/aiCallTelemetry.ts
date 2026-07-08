import type { LanguageModel } from 'ai';
import type { AiCallFeature } from '../../../../analytics/aiUsage';

export type { AiCallFeature };

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
    provider?: string | null;
};

/**
 * The AI SDK provider id (e.g. `amazon-bedrock`) doesn't always match our
 * configured provider vocabulary (`openai/azure/anthropic/bedrock/openrouter`)
 * that cost accounting joins on. Normalize the mismatches here so the same
 * provider gets one label across LLM and embedding rows.
 */
const normalizeProvider = (provider: string): string =>
    provider === 'amazon-bedrock' ? 'bedrock' : provider;

/**
 * Model name + provider attribution derived from an AI SDK model object.
 * The SDK provider id is dot-namespaced (e.g. `azure.chat`,
 * `amazon-bedrock`); the first segment (after normalization) matches our
 * configured provider names (openai/azure/anthropic/bedrock/openrouter), which
 * is what cost accounting joins on — the same model name bills differently per
 * provider. Bare string models carry no provider information.
 */
export const getLanguageModelAttribution = (
    model: LanguageModel,
): Pick<AiCallAttribution, 'model' | 'provider'> => {
    if (typeof model === 'string') {
        return { model, provider: null };
    }
    // `|| null` (not `??`) so an empty provider id collapses to null rather
    // than a phantom `''` provider that would pass the metadata filter.
    const provider = model.provider?.split('.')[0] || null;
    return {
        model: model.modelId,
        provider: provider === null ? null : normalizeProvider(provider),
    };
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
    'provider',
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
    modelOptions: { model?: LanguageModel; telemetry?: AiCallAttribution },
    functionId: string,
    feature: AiCallFeature,
) =>
    getAiCallTelemetry({
        functionId,
        feature,
        ...(modelOptions.model != null
            ? getLanguageModelAttribution(modelOptions.model)
            : {}),
        ...(modelOptions.telemetry ?? {}),
    });
