import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_LOAD_MCP_TOOLS_DESCRIPTION =
    'Load the definitions for MCP tools you need before calling them. Pass exact tool names from the MCP tools section of the system prompt. Loaded definitions remain available for the rest of the thread.';

export const toolLoadMcpToolsArgsSchema = z.object({
    names: z
        .array(z.string().min(1))
        .min(1)
        .describe('Exact MCP tool names to load.'),
});

export const toolLoadMcpToolsStructuredContentSchema = z.object({
    loaded: z
        .array(z.string())
        .describe(
            'MCP tool names that matched an available tool and are now loaded; empty when nothing was loaded.',
        ),
    unmatched: z
        .array(
            z.object({
                name: z
                    .string()
                    .describe('Requested name with no exact match.'),
                nearMatches: z
                    .array(z.string())
                    .describe(
                        'Up to three available tool names close to the requested name; empty when none are close.',
                    ),
            }),
        )
        .describe('Requested names that did not match any available MCP tool.'),
});

export const toolLoadMcpToolsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolLoadMcpToolsStructuredContentSchema,
});

export type ToolLoadMcpToolsArgs = z.infer<typeof toolLoadMcpToolsArgsSchema>;
export type ToolLoadMcpToolsStructuredContent = z.infer<
    typeof toolLoadMcpToolsStructuredContentSchema
>;
export type ToolLoadMcpToolsOutput = z.infer<
    typeof toolLoadMcpToolsOutputSchema
>;
