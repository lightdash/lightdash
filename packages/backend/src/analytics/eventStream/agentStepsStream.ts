import type {
    AiAgentStepCompletedEvent,
    AiAgentToolCallCompletedEvent,
} from '../LightdashAnalytics';
import { buildEnvelope, ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

/**
 * Compacted (parquet) columns for the `agent_steps` stream, v1. Both grains —
 * loop step and finished tool call — share it, discriminated by `record_type`,
 * since they are read together. Columns of one grain are null on the other.
 */
export const agentStepsCompactedColumns: CompactedStreamColumn[] = [
    { name: 'event_name', type: 'VARCHAR' },
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'record_type', type: 'VARCHAR' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'agent_id', type: 'VARCHAR' },
    { name: 'thread_id', type: 'VARCHAR' },
    { name: 'prompt_id', type: 'VARCHAR' },
    { name: 'step_index', type: 'INTEGER' },
    // step grain
    { name: 'model', type: 'VARCHAR' },
    { name: 'model_provider', type: 'VARCHAR' },
    { name: 'step_offset_ms', type: 'BIGINT' },
    { name: 'step_total_ms', type: 'BIGINT' },
    { name: 'inference_ms', type: 'BIGINT' },
    { name: 'tool_wall_ms', type: 'BIGINT' },
    { name: 'ttft_ms', type: 'BIGINT' },
    { name: 'tool_call_count', type: 'INTEGER' },
    { name: 'reasoning_chars', type: 'BIGINT' },
    { name: 'input_tokens', type: 'BIGINT' },
    { name: 'output_tokens', type: 'BIGINT' },
    { name: 'cache_read_tokens', type: 'BIGINT' },
    { name: 'cache_write_tokens', type: 'BIGINT' },
    { name: 'reasoning_tokens', type: 'BIGINT' },
    { name: 'total_tokens', type: 'BIGINT' },
    // tool-call grain
    { name: 'tool_call_id', type: 'VARCHAR' },
    { name: 'tool_name', type: 'VARCHAR' },
    { name: 'tool_duration_ms', type: 'BIGINT' },
    { name: 'tool_status', type: 'VARCHAR' },
];

/** One row per finished loop iteration. */
const projectAgentStepEvent = (
    payload: AiAgentStepCompletedEvent,
): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    return {
        stream: 'agent_steps',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            record_type: 'step',
            project_id: properties.projectId,
            agent_id: properties.aiAgentId,
            thread_id: properties.threadId,
            prompt_id: properties.promptId,
            step_index: properties.stepIndex,
            model: properties.model,
            model_provider: properties.modelProvider,
            step_offset_ms: properties.stepOffsetMs,
            step_total_ms: properties.stepTotalMs,
            inference_ms: properties.inferenceMs,
            tool_wall_ms: properties.toolWallMs,
            ttft_ms: properties.ttftMs,
            tool_call_count: properties.toolCallCount,
            reasoning_chars: properties.reasoningChars,
            input_tokens: properties.inputTokens,
            output_tokens: properties.outputTokens,
            cache_read_tokens: properties.cacheReadTokens,
            cache_write_tokens: properties.cacheWriteTokens,
            reasoning_tokens: properties.reasoningTokens,
            total_tokens: properties.totalTokens,
            tool_call_id: null,
            tool_name: null,
            tool_duration_ms: null,
            tool_status: null,
        },
    };
};

/** One row per returned tool call, joined to its step by step_index. */
const projectAgentToolCallCompletedEvent = (
    payload: AiAgentToolCallCompletedEvent,
): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId) return null;
    return {
        stream: 'agent_steps',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            record_type: 'tool_call',
            project_id: properties.projectId,
            agent_id: properties.aiAgentId,
            thread_id: properties.threadId,
            prompt_id: properties.promptId,
            step_index: properties.stepIndex,
            model: null,
            model_provider: null,
            step_offset_ms: null,
            step_total_ms: null,
            inference_ms: null,
            tool_wall_ms: null,
            ttft_ms: null,
            tool_call_count: null,
            reasoning_chars: null,
            input_tokens: null,
            output_tokens: null,
            cache_read_tokens: null,
            cache_write_tokens: null,
            reasoning_tokens: null,
            total_tokens: null,
            tool_call_id: properties.toolCallId,
            tool_name: properties.toolName,
            tool_duration_ms: properties.durationMs,
            tool_status: properties.status,
        },
    };
};

export const agentStepsProjections = {
    'ai_agent.step_completed': projectAgentStepEvent,
    'ai_agent.tool_call_completed': projectAgentToolCallCompletedEvent,
};
