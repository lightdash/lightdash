import { Track as AnalyticsTrack } from '@rudderstack/rudder-sdk-node';
import type { EmbeddingModelUsage, LanguageModelUsage } from 'ai';
import Logger from '../logging/logger';

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

/**
 * Coarse feature bucket for an AI call. Lets us attribute token usage and cost
 * to a product surface (data apps vs the agent vs metadata generation, etc.)
 * independently of the fine-grained `functionId`.
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
 * Token counts for a single AI call, normalized across providers and call
 * kinds (LLM text/object generation, embeddings). Null means the provider
 * did not report that class of tokens.
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
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? null,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
});

export const embeddingModelUsageToTokens = (
    usage: EmbeddingModelUsage,
): AiUsageTokens => ({
    inputTokens: usage.tokens,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    totalTokens: usage.tokens,
});

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
        model: string | null;
        provider: string | null;
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
 * Structural subset of the `experimental_telemetry` config built by
 * `getAiCallTelemetry`, which every AI call site already holds — its metadata
 * carries the feature + attribution dimensions.
 */
type AiCallTelemetryConfig = {
    functionId: string;
    metadata: Record<string, string | number | boolean>;
};

const getMetadataString = (
    metadata: AiCallTelemetryConfig['metadata'],
    key: string,
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
        const { metadata } = telemetry;
        const userUuid = getMetadataString(metadata, 'userUuid');
        const properties: AiUsageEvent['properties'] = {
            feature: metadata.feature as AiCallFeature,
            functionId: telemetry.functionId,
            organizationId: getMetadataString(metadata, 'organizationUuid'),
            projectId: getMetadataString(metadata, 'projectUuid'),
            aiAgentId: getMetadataString(metadata, 'agentUuid'),
            threadId: getMetadataString(metadata, 'threadUuid'),
            promptId: getMetadataString(metadata, 'promptUuid'),
            model: getMetadataString(metadata, 'model'),
            provider: getMetadataString(metadata, 'provider'),
            ...tokens,
        };

        Logger.info('AI usage', {
            event: 'ai.usage',
            userId: userUuid,
            ...properties,
        });

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
