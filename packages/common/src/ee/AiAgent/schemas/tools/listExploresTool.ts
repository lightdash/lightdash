import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';

// Implemented via an AI SDK tool() wrapper (getMcpListExplores) but only
// surfaced over MCP — hence both runtime views are provided.
export const listExploresTool = defineTool({
    name: 'listExplores',
    title: 'List Explores',
    description: (name) => `Tool: ${name}

Purpose:
Lists all Explores available to the user in the current project. Returns a summary of each explore including its name, label, base table, and tags.

Usage Tips:
- Use this to discover what data sources are available before using findExplores for detailed field information
- No arguments needed - automatically uses the current project context
- Results are filtered based on user permissions and selected tags
- Returns explore metadata without field details for quick overview
`,
    availability: 'both',
    inputSchema: z.object({}),
    agent: {
        outputSchema: z.object({
            result: z.string(),
            metadata: baseOutputMetadataSchema,
        }),
    },
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
