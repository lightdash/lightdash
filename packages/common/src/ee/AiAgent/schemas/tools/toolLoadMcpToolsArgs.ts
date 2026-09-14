import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_LOAD_MCP_TOOLS_DESCRIPTION =
    'Load the definitions for MCP tools you need before calling them. Pass exact tool names from the MCP tools section of the system prompt. Loaded definitions remain available for the rest of the thread.';

export const toolLoadMcpToolsArgsSchema = z.object({
    names: z
        .array(z.string().min(1))
        .min(1)
        .describe('Exact MCP tool names to load.'),
});

export const toolLoadMcpToolsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolLoadMcpToolsArgs = z.infer<typeof toolLoadMcpToolsArgsSchema>;
