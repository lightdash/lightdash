import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const getMcpToolListExploresDescription = ({
    findExploresName,
    name,
}: {
    findExploresName: string;
    name: string;
}) => `Tool: ${name}

Purpose:
Lists all Explores available to the user in the current project. Returns a summary of each explore including its name, label, base table, and tags.

Usage Tips:
- Use this to discover what data sources are available before using ${findExploresName} for detailed field information
- No arguments needed - automatically uses the current project context
- Results are filtered based on user permissions and selected tags
- Returns explore metadata without field details for quick overview
`;

const mcpToolListExploresArgsSchema = createToolSchema({
    description: getMcpToolListExploresDescription({
        findExploresName: 'find_explores',
        name: 'list_explores',
    }),
}).build();

const mcpToolListExploresOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const listExploresTool = defineTool({
    canonicalName: 'listExplores',
    title: 'List Explores',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () => mcpToolListExploresArgsSchema,
    },
    outputSchema: mcpToolListExploresOutputSchema,
});

export type McpToolListExploresArgs = ToolInput<typeof listExploresTool, 'mcp'>;
export type McpToolListExploresOutput = ToolOutput<typeof listExploresTool>;
