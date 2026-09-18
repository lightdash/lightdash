import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_GENERATE_HASHES_DESCRIPTION =
    'Generate deterministic base-36 hashes for input strings.';

export const toolGenerateHashesArgsSchema = z.object({
    inputs: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe('Input strings to hash.'),
});

export const mcpGenerateHashesStructuredOutputSchema = z.object({
    hashes: z
        .array(z.string().regex(/^[0-9a-z]{6}$/))
        .describe('Base-36 hashes in the same order as the input strings.'),
});

// Agent and MCP surface the same structured shape.
export const toolGenerateHashesStructuredContentSchema =
    mcpGenerateHashesStructuredOutputSchema;

export const toolGenerateHashesOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolGenerateHashesStructuredContentSchema,
});

export type ToolGenerateHashesArgs = z.infer<
    typeof toolGenerateHashesArgsSchema
>;

export type ToolGenerateHashesStructuredContent = z.infer<
    typeof toolGenerateHashesStructuredContentSchema
>;

export type ToolGenerateHashesOutput = z.infer<
    typeof toolGenerateHashesOutputSchema
>;
