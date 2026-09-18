import { z } from 'zod';

export const baseOutputMetadataSchema = z.object({
    status: z.enum(['success', 'error']),
});

export type BaseOutputMetadata = z.infer<typeof baseOutputMetadataSchema>;

export const toolErrorStructuredContentSchema = z.object({
    error: z
        .string()
        .describe('Why the tool call failed; the same message as `result`.'),
});

export type ToolErrorStructuredContent = z.infer<
    typeof toolErrorStructuredContentSchema
>;

/**
 * Output envelope of every agent tool. `result` is the text the model reads,
 * `metadata` carries the status plus tool-specific diagnostics, and
 * `structuredContent` is the same answer as typed JSON: the tool's own shape on
 * success, `{ error }` on failure. It is required on every path so programs
 * (code mode) never have to parse text.
 */
export const structuredToolOutputSchema = <
    TMetadata extends z.ZodType,
    TStructuredContent extends z.ZodType,
>(schemas: {
    metadata: TMetadata;
    structuredContent: TStructuredContent;
}) =>
    z.object({
        result: z.string(),
        metadata: schemas.metadata,
        structuredContent: z.union([
            schemas.structuredContent,
            toolErrorStructuredContentSchema,
        ]),
    });

/**
 * The same envelope as stored in `ai_agent_tool_results`, which keeps only the
 * text and the metadata. Use this to read a tool result back from the database
 * (history, admin views); use the tool's own output schema for what a tool
 * returns, where `structuredContent` is required.
 */
export const persistedToolOutputSchema = <
    TShape extends { result: z.ZodType; metadata: z.ZodType },
>(
    outputSchema: z.ZodObject<TShape & { structuredContent: z.ZodType }>,
) => outputSchema.partial({ structuredContent: true });
