import { z } from 'zod';
import { defineTool } from '../defineTool';

export const setProjectTool = defineTool({
    name: 'setProject',
    title: 'Set Project',
    description:
        'Set the active project for all subsequent MCP operations. Most tools (list_explores, find_fields, run_metric_query, etc.) require an active project. Setting a project clears any previously selected agent, since agents are scoped to a project. After setting a project, use list_agents to discover available AI agents and optionally set_agent to activate one.',
    availability: 'mcp',
    inputSchema: z.object({
        projectUuid: z.string(),
        tags: z.array(z.string()).optional(),
    }),
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
