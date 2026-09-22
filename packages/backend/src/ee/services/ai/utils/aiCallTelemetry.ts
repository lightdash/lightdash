import type { LanguageModel } from 'ai';
import type {
    AiCallFeature,
    AiCallRuntimeContextKey,
    AiKeyManagement,
} from '../../../../analytics/aiUsage';

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
    // Data app the call ran for (runtime analysis, generation).
    appUuid?: string | null;
    model?: string | null;
    provider?: string | null;
    // Whether the call ran on a Lightdash-managed key or the org's own key.
    keyManagement?: AiKeyManagement | null;
};

/**
 * The AI SDK provider id (e.g. `amazon-bedrock`) doesn't always match our
 * configured provider vocabulary
 * (`openai/azure/anthropic/google/bedrock/openrouter`)
 * that cost accounting joins on. Normalize the mismatches here so the same
 * provider gets one label across LLM and embedding rows.
 */
const normalizeProvider = (provider: string): string =>
    provider === 'amazon-bedrock' ? 'bedrock' : provider;

/**
 * Model name + provider attribution derived from an AI SDK model object.
 * The SDK provider id is dot-namespaced (e.g. `azure.chat`,
 * `amazon-bedrock`); the first segment (after normalization) matches our
 * configured provider names
 * (openai/azure/anthropic/google/bedrock/openrouter), which
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
     * The key origin for the call. This field is necessary, unlike the optional
     * `keyManagement` on AiCallAttribution. Use a Lightdash-managed key, a
     * self-managed (BYO) key, or null. Use null only for a path that does not
     * record the key origin, for example embeddings or internal evaluations.
     */
    keyManagement: AiKeyManagement | null;
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
    'appUuid',
    'model',
    'provider',
    'keyManagement',
];

/**
 * Attribution dimensions that may be sent to telemetry providers. Everything
 * else stays local to Lightdash's own `ai.usage` analytics.
 */
const TELEMETRY_REPORTED_KEYS: AiCallRuntimeContextKey[] = [
    'feature',
    ...ATTRIBUTION_KEYS,
];

/**
 * Builds the telemetry options for any Vercel AI SDK call (generateText /
 * streamText / embed). Spread the result into the call, since attribution is a
 * call-level option rather than part of the telemetry block:
 *
 *     const telemetry = getAiCallTelemetry({ ... });
 *     streamText({ ...telemetry, model, messages });
 *
 * Telemetry is opt-out in AI SDK 7 — spans emit whenever an integration is
 * registered — so only input/output content capture is gated (`recordIO`).
 *
 * Attribution pins each call to a `feature` + org/project (+ agent/thread/prompt
 * where available) so token usage and cost can be attributed in tracing. AI SDK 7
 * dropped `telemetry.metadata`; the equivalent is a call-level `runtimeContext`
 * plus `telemetry.includeRuntimeContext`, which must name every key explicitly
 * because nothing is forwarded by default. Nullish dimensions are dropped.
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

    // Allow-list, not a mirror of the data: AI SDK 7 forwards nothing to
    // telemetry providers unless it is named here. Deriving this from
    // `Object.keys(metadata)` would defeat the mechanism, because `extra` is
    // caller-controlled (see `generateArtifactQuestion`, which passes a
    // `Record<string, string>` straight through) and anything a caller ever adds
    // would silently reach the provider. Adding a span dimension is a deliberate
    // edit here. `emitAiUsage` reads `runtimeContext` directly, so our own
    // `ai.usage` analytics keeps every dimension regardless.
    const includeRuntimeContext = Object.fromEntries(
        TELEMETRY_REPORTED_KEYS.filter((key) => key in metadata).map((key) => [
            key,
            true,
        ]),
    );

    return {
        runtimeContext: metadata,
        telemetry: {
            functionId,
            recordInputs: recordIO,
            recordOutputs: recordIO,
            includeRuntimeContext,
        },
    } as const;
};

/**
 * Convenience wrapper for generator-style calls that carry their attribution on
 * `modelOptions.telemetry`. Structural param (not `GeneratorModelOptions`) to
 * avoid an import cycle with the models package.
 */
export const getGeneratorTelemetry = (
    modelOptions: {
        model?: LanguageModel;
        telemetry?: AiCallAttribution;
        // Stamped by the model builder (getModel/getFastModelForAccessibleKey)
        // so generator calls report managed-vs-BYO without threading it through
        // every call site's telemetry attribution.
        keyManagement?: AiKeyManagement | null;
    },
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
        // Always set this field. Set it last so that it is the final value.
        // The model builder is the correct source for the key origin. This
        // necessary field must be present.
        keyManagement: modelOptions.keyManagement ?? null,
    });
