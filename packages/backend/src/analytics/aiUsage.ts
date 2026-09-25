import type { AiDeepResearchPhase } from '@lightdash/common';
import { Track as AnalyticsTrack } from '@rudderstack/rudder-sdk-node';
import type { EmbeddingModelUsage, LanguageModelUsage } from 'ai';
import Logger from '../logging/logger';

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

/**
 * Coarse feature bucket for an AI call. Lets us attribute token usage and cost
 * to a product surface (data apps vs the agent vs metadata generation, etc.)
 * independently of the fine-grained `functionId`.
 *
 * The list is the single source of truth: `AiCallFeature` is derived from it,
 * so the runtime membership a guard needs cannot drift from the type.
 */
export const AI_CALL_FEATURES = [
    'agent',
    'deep-research',
    'agent-subtask',
    'chart-metadata',
    'chart-similarity',
    'chart-type-fields',
    'chart-type-explore',
    'document-summary',
    'thread-title',
    'tooltip',
    'artifact-question',
    'agent-suggestions',
    'table-calc',
    'custom-dimension',
    'formula-table-calc',
    'compaction',
    'embedding',
    'project-router',
    'agent-selector',
    'review-classifier',
    'prompt-input-classifier',
    'ai-agent-memory',
    'llm-judge',
    'data-app',
    'managed-agent',
    'external-connection-config',
    'delivery-summary',
    'data-app-analysis',
] as const;

export type AiCallFeature = (typeof AI_CALL_FEATURES)[number];

// Typed as ReadonlySet<string> so `has` accepts an unnarrowed string; a
// ReadonlySet<AiCallFeature> would only accept what we are trying to test.
const FEATURES: ReadonlySet<string> = new Set(AI_CALL_FEATURES);

const isAiCallFeature = (value: unknown): value is AiCallFeature =>
    typeof value === 'string' && FEATURES.has(value);

/**
 * Whether the AI call ran on Lightdash's own (instance) provider key or the
 * customer's self-managed (bring-your-own) key. Lets analytics/CS tell who is
 * on a Lightdash-managed key — e.g. to follow up on upgrades, or spot orgs
 * using our key when they shouldn't. Null when the origin isn't known for the
 * call (e.g. embeddings/instance-only paths).
 */
export type AiKeyManagement = 'lightdash-managed' | 'self-managed';

const AI_KEY_MANAGEMENT_VALUES: readonly AiKeyManagement[] = [
    'lightdash-managed',
    'self-managed',
];

const parseKeyManagement = (value: string | null): AiKeyManagement | null =>
    value !== null && (AI_KEY_MANAGEMENT_VALUES as string[]).includes(value)
        ? (value as AiKeyManagement)
        : null;

/**
 * Token counts for a single AI call, normalized across providers and call
 * kinds (LLM text/object generation, embeddings). Null means the provider
 * did not report that class of tokens.
 *
 * `inputTokens` is the total number of prompt tokens. This total includes the
 * cache-read tokens and the cache-write tokens. The warehouse model
 * `ai_token_usage` calculates the uncached input tokens. To do this, it
 * subtracts the cache tokens (`input_tokens - cache_read - cache_write`). Each
 * producer must keep this total. If a producer records only the uncached part,
 * the input count becomes too low. The uncached column then becomes zero.
 */
export type AiUsageTokens = {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
};

// Defensive against the type: providers (and test mocks) don't always report
// usage, and a missing field must never throw into the AI call path.
export const languageModelUsageToTokens = (
    usage: LanguageModelUsage,
): AiUsageTokens => ({
    // The AI SDK `inputTokens` is the total input. It includes the cache-read
    // tokens and the cache-write tokens. `inputTokenDetails` gives each class.
    // Keep this total. The warehouse calculates the uncached input. To do this,
    // it subtracts the cache tokens.
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? null,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
});

export const embeddingModelUsageToTokens = (
    usage: EmbeddingModelUsage,
): AiUsageTokens => {
    // The AI SDK substitutes `{ tokens: NaN }` when the provider omits usage,
    // and NaN is not nullish — coerce non-finite (or absent) values to null so
    // "the provider did not report" stays honest.
    const tokens = Number.isFinite(usage?.tokens) ? usage.tokens : null;
    return {
        inputTokens: tokens,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        totalTokens: tokens,
    };
};

/**
 * One event per AI model call, emitted 100% unsampled (unlike traces) so
 * token usage can be accounted per org/user/feature. Consumed by the usage
 * event stream sink (`ai_usage` stream) and Rudderstack.
 */
export type AiUsageEvent = BaseTrack & {
    event: 'ai.usage';
    properties: {
        feature: AiCallFeature;
        functionId: string;
        organizationId: string | null;
        projectId: string | null;
        aiAgentId: string | null;
        threadId: string | null;
        promptId: string | null;
        dataAppId: string | null;
        model: string | null;
        provider: string | null;
        keyManagement: AiKeyManagement | null;
        managedAgentRunId: string | null;
        deepResearchRunId: string | null;
        deepResearchPhase: AiDeepResearchPhase | null;
    } & AiUsageTokens;
};

type AiUsageTrackFn = (event: AiUsageEvent) => void;

let aiUsageTrackFn: AiUsageTrackFn | null = null;

/**
 * Registered once per process at app construction (API, scheduler, NATS
 * worker). Module-level because `ai.usage` is emitted from pure helper
 * functions (AI generators) that have no access to the LightdashAnalytics
 * instance — same pattern as the global Logger.
 */
export const registerAiUsageTracker = (fn: AiUsageTrackFn): void => {
    aiUsageTrackFn = fn;
};

/**
 * Structural subset of the telemetry options built by `getAiCallTelemetry`,
 * which every AI call site already holds. AI SDK 7 removed `telemetry.metadata`,
 * so the attribution dimensions now travel as the call-level `runtimeContext`.
 */
type AiCallTelemetryConfig = {
    telemetry: { functionId: string };
    runtimeContext: Record<string, string | number | boolean>;
};

/**
 * Dimensions this event is built from. The runtime context is a flat bag
 * because callers may add their own keys, so naming the readable ones here is
 * what stops a typo silently resolving to `null`. `getAiCallTelemetry` imports
 * this to decide which dimensions may reach telemetry providers.
 */
export type AiCallRuntimeContextKey =
    | 'feature'
    | 'organizationUuid'
    | 'projectUuid'
    | 'agentUuid'
    | 'threadUuid'
    | 'promptUuid'
    | 'userUuid'
    | 'model'
    | 'provider'
    | 'keyManagement'
    | 'appUuid'
    | 'runUuid'
    | 'deepResearchRunUuid'
    | 'deepResearchPhase';

const getMetadataString = (
    metadata: AiCallTelemetryConfig['runtimeContext'],
    key: AiCallRuntimeContextKey,
): string | null => {
    const value = metadata[key];
    return typeof value === 'string' ? value : null;
};

/**
 * Emits token usage for a single AI call in two forms:
 * 1. A structured log line (marker `event: 'ai.usage'`) so any log stack can
 *    consume it. Level `info` on purpose — prod log thresholds must include
 *    it or usage silently vanishes from log-based consumers.
 * 2. An `ai.usage` analytics event through `track()`, which the usage event
 *    stream sink projects into the `ai_usage` stream.
 */
export const emitAiUsage = (
    telemetry: AiCallTelemetryConfig,
    tokens: AiUsageTokens,
): void => {
    try {
        const metadata = telemetry.runtimeContext;
        const userUuid = getMetadataString(metadata, 'userUuid');
        // getAiCallTelemetry only ever writes a typed feature, so this is a
        // programming error; the surrounding catch logs it rather than letting
        // an unusable event reach the analytics contract.
        if (!isAiCallFeature(metadata.feature)) {
            throw new Error(
                `Unknown AI call feature: ${String(metadata.feature)}`,
            );
        }
        const properties: AiUsageEvent['properties'] = {
            feature: metadata.feature,
            functionId: telemetry.telemetry.functionId,
            organizationId: getMetadataString(metadata, 'organizationUuid'),
            projectId: getMetadataString(metadata, 'projectUuid'),
            aiAgentId: getMetadataString(metadata, 'agentUuid'),
            threadId: getMetadataString(metadata, 'threadUuid'),
            promptId: getMetadataString(metadata, 'promptUuid'),
            dataAppId: getMetadataString(metadata, 'appUuid'),
            model: getMetadataString(metadata, 'model'),
            provider: getMetadataString(metadata, 'provider'),
            keyManagement: parseKeyManagement(
                getMetadataString(metadata, 'keyManagement'),
            ),
            managedAgentRunId:
                metadata.feature === 'managed-agent'
                    ? getMetadataString(metadata, 'runUuid')
                    : null,
            deepResearchRunId: getMetadataString(
                metadata,
                'deepResearchRunUuid',
            ),
            deepResearchPhase: getMetadataString(
                metadata,
                'deepResearchPhase',
            ) as AiDeepResearchPhase | null,
            ...tokens,
        };

        // Interpolate the key fields into the message itself: the default
        // `pretty`/`plain` log formats render only the message string and drop
        // all metadata, so log-based consumers would otherwise see a bare
        // `AI usage` line with no token data.
        Logger.info(
            `AI usage: feature=${properties.feature} provider=${properties.provider} keyManagement=${properties.keyManagement} model=${properties.model} ` +
                `inputTokens=${properties.inputTokens} outputTokens=${properties.outputTokens} ` +
                `cacheReadTokens=${properties.cacheReadTokens} cacheWriteTokens=${properties.cacheWriteTokens} ` +
                `reasoningTokens=${properties.reasoningTokens} totalTokens=${properties.totalTokens} ` +
                `organizationId=${properties.organizationId} projectId=${properties.projectId} userId=${userUuid} managedAgentRunId=${properties.managedAgentRunId}`,
            {
                event: 'ai.usage',
                userId: userUuid,
                ...properties,
            },
        );

        aiUsageTrackFn?.({
            event: 'ai.usage',
            ...(userUuid !== null
                ? { userId: userUuid }
                : { anonymousId: 'anonymous' }),
            properties,
        });
    } catch (error) {
        Logger.warn(`Failed to emit AI usage: ${error}`);
    }
};
