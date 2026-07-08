import type { AiUsageEvent } from '../aiUsage';
import { buildEnvelope, ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

/**
 * Typed column list for the compacted (parquet) zone of the `ai_usage`
 * stream, v1. Envelope columns first, then one typed column per field of the
 * ai.usage projection below — one row per AI model call.
 */
export const aiUsageCompactedColumns: CompactedStreamColumn[] = [
    { name: 'event_name', type: 'VARCHAR' },
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'feature', type: 'VARCHAR' },
    { name: 'function_id', type: 'VARCHAR' },
    { name: 'agent_id', type: 'VARCHAR' },
    { name: 'thread_id', type: 'VARCHAR' },
    { name: 'prompt_id', type: 'VARCHAR' },
    { name: 'model', type: 'VARCHAR' },
    { name: 'provider', type: 'VARCHAR' },
    { name: 'input_tokens', type: 'BIGINT' },
    { name: 'output_tokens', type: 'BIGINT' },
    { name: 'cache_read_tokens', type: 'BIGINT' },
    { name: 'cache_write_tokens', type: 'BIGINT' },
    { name: 'reasoning_tokens', type: 'BIGINT' },
    { name: 'total_tokens', type: 'BIGINT' },
];

/**
 * Projection for the `ai_usage` stream (v1): one row per AI model call,
 * emitted via `emitAiUsage`. Returns null when the call can't be attributed
 * to an organization.
 */
const projectAiUsageEvent = (payload: AiUsageEvent): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    return {
        stream: 'ai_usage',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            project_id: properties.projectId,
            feature: properties.feature,
            function_id: properties.functionId,
            agent_id: properties.aiAgentId,
            thread_id: properties.threadId,
            prompt_id: properties.promptId,
            model: properties.model,
            provider: properties.provider,
            input_tokens: properties.inputTokens,
            output_tokens: properties.outputTokens,
            cache_read_tokens: properties.cacheReadTokens,
            cache_write_tokens: properties.cacheWriteTokens,
            reasoning_tokens: properties.reasoningTokens,
            total_tokens: properties.totalTokens,
        },
    };
};

export const aiUsageProjections = {
    'ai.usage': projectAiUsageEvent,
};
