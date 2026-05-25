import { z } from 'zod';
import { defineTool } from '../defineTool';

export const setAgentTool = defineTool({
    name: 'setAgent',
    title: 'Set Agent',
    description:
        "Set the active AI agent. Returns the agent's full context including: explores it has access to, verified questions (curated example queries that demonstrate correct usage of the data model), and custom instructions. Use this context to guide subsequent tool calls — prefer the agent's explores when calling find_explores/find_fields, reference verified questions as patterns for building queries with run_metric_query, and follow the agent's instructions for domain-specific conventions.",
    availability: 'mcp',
    inputSchema: z.object({
        agentUuid: z.string(),
    }),
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
