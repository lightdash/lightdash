import { z } from 'zod';
import { defineTool } from '../defineTool';

export const clearAgentTool = defineTool({
    name: 'clearAgent',
    title: 'Clear Agent',
    description:
        "Clear the active AI agent from context. After clearing, tool calls will no longer be scoped to a specific agent's explores, tags, or instructions. The active project is preserved.",
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
