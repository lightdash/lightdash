import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const MCP_TOOL_LIST_EXPLORES_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

List the explores the user can access in a project, limited to the agent's tags when agent-scoped: each explore's name, label, base table, tags, joined tables and required filters, without its fields. Use it for an overview of the available data; grep_fields and get_metadata give the fields.
`;

// MCP-only tool - no type field needed
export const mcpToolListExploresArgsSchema = z.object({});

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
