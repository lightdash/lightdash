import type { McpToolCallEvent } from '../LightdashAnalytics';
import { buildEnvelope, type ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

export const mcpToolCallsColumns: CompactedStreamColumn[] = [
    ...['event_name', 'org_id', 'user_id'].map((name) => ({
        name,
        type: 'VARCHAR' as const,
    })),
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
    ...[
        'project_id',
        'agent_id',
        'tool_call_id',
        'actor_id',
        'actor_type',
        'tool_name',
        'status',
        'auth_type',
        'client_name',
        'client_version',
        'protocol_version',
        'session_id',
        'query_id',
    ].map((name) => ({ name, type: 'VARCHAR' as const })),
    { name: 'duration_ms', type: 'BIGINT' },
];

const projectMcpToolCall = (payload: McpToolCallEvent): ProjectionResult => {
    const { properties: p } = payload;
    if (!p.organizationId) return null;
    return {
        stream: 'mcp_tool_calls',
        row: {
            ...buildEnvelope(payload, p.organizationId),
            // Service principals must not join to the registered users dimension.
            user_id: p.actorType === 'user' ? payload.userId : null,
            actor_id: payload.userId,
            actor_type: p.actorType,
            project_id: p.projectId ?? null,
            agent_id: p.agentId ?? null,
            tool_call_id: p.toolCallId,
            tool_name: p.toolName,
            status: p.status,
            duration_ms: p.durationMs,
            auth_type: p.authType,
            client_name: p.clientName ?? null,
            client_version: p.clientVersion ?? null,
            protocol_version: p.protocolVersion ?? null,
            session_id: p.sessionId ?? null,
            query_id: p.queryId ?? null,
        },
    };
};

// Deliberately omit tool arguments, results, raw user agents and error messages.
export const mcpToolCallsProjections = { mcp_tool_call: projectMcpToolCall };
