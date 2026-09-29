import type { McpToolCallEvent } from '../LightdashAnalytics';
import { mcpToolCallsProjections } from './mcpToolCallsStream';

const event: McpToolCallEvent = {
    event: 'mcp_tool_call',
    userId: 'user-1',
    properties: {
        organizationId: 'org-1',
        projectId: 'project-1',
        toolCallId: 'call-1',
        actorType: 'user',
        toolName: 'list_explores',
        status: 'error',
        durationMs: 42,
        authType: 'oauth',
        clientName: 'Client',
        clientVersion: '1',
        userAgent: 'private-agent',
    },
};

describe('MCP usage projection', () => {
    it('retains errors without a query and projects only the allowlisted fields', () => {
        const result = mcpToolCallsProjections.mcp_tool_call(event)!;
        expect(result.stream).toBe('mcp_tool_calls');
        expect(result.row).toMatchObject({
            tool_call_id: 'call-1',
            tool_name: 'list_explores',
            user_id: 'user-1',
            actor_id: 'user-1',
            actor_type: 'user',
            status: 'error',
            duration_ms: 42,
            query_id: null,
            client_name: 'Client',
        });
        expect(result.row).not.toHaveProperty('userAgent');
        expect(result.row).not.toHaveProperty('user_agent');
        expect(result.row).not.toHaveProperty('tool_args');
    });
    it('keeps service identity separate from registered users and unknown clients null', () => {
        const result = mcpToolCallsProjections.mcp_tool_call({
            ...event,
            properties: {
                ...event.properties,
                actorType: 'service_account',
                authType: 'service-account',
                clientName: undefined,
            },
        })!;
        expect(result.row).toMatchObject({
            user_id: null,
            actor_id: 'user-1',
            actor_type: 'service_account',
            client_name: null,
        });
    });
    it('ignores events without organization attribution', () => {
        expect(
            mcpToolCallsProjections.mcp_tool_call({
                ...event,
                properties: { ...event.properties, organizationId: '' },
            }),
        ).toBeNull();
    });
});
