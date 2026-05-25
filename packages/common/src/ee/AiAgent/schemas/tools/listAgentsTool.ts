import { z } from 'zod';
import { defineTool } from '../defineTool';

export const listAgentsTool = defineTool({
    name: 'listAgents',
    title: 'List Agents',
    description:
        'List all accessible AI agents. Optionally filter by project UUID. Each agent is pre-configured with specific explores, tags, verified questions, and instructions that define its domain expertise. Use this to discover which agents are available before calling set_agent.',
    availability: 'mcp',
    inputSchema: z.object({
        projectUuid: z.string().optional(),
    }),
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
