import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const MCP_TOOL_LIST_EXPLORES_DESCRIPTION = `Tool: listExplores

Purpose:
Lists all Explores available to the user in the current project. Returns a summary of each explore including its name, label, base table, and tags.

Usage Tips:
- Use this to discover what data sources are available before using findExplores for detailed field information
- No arguments needed - automatically uses the current project context
- Results are filtered based on user permissions and selected tags
- Returns explore metadata without field details for quick overview
`;

// MCP-only tool - no type field needed
export const mcpToolListExploresArgsSchema = z
    .object({})
    .describe(MCP_TOOL_LIST_EXPLORES_DESCRIPTION);

export type McpToolListExploresArgs = z.infer<
    typeof mcpToolListExploresArgsSchema
>;

export const mcpToolListExploresOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type McpToolListExploresOutput = z.infer<
    typeof mcpToolListExploresOutputSchema
>;
