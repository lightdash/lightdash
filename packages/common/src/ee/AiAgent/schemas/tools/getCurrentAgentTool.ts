import { z } from 'zod';
import { defineTool } from '../defineTool';

export const getCurrentAgentTool = defineTool({
    name: 'getCurrentAgent',
    title: 'Get Current Agent',
    description:
        "Get the currently active AI agent with its full context: explores it has access to, verified questions (curated example queries), and custom instructions. Use this to retrieve the agent's domain knowledge before making data queries.",
    availability: 'mcp',
    inputSchema: z.object({}),
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
