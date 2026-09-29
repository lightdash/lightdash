import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { generativeUiHttpMethodSchema } from './toolGenerateUiArgs';

export const TOOL_SEARCH_API_DESCRIPTION =
    'Search the Lightdash API operations a generateUi card may call, by what they do (e.g. "move charts to a space", "dashboard schedules"). Returns up to 15 operations with operationId, method, path, summary and kind: a query (GET) feeds a card\'s inputs and tables, a mutation runs in its action. Read an operation with describeApi before binding it.';

export const toolSearchApiArgsSchema = z.object({
    query: z
        .string()
        .min(1)
        .max(200)
        .describe('What the operation should do, in a few words.'),
    kind: z
        .enum(['query', 'mutation'])
        .nullable()
        .describe(
            'query for read-only GET operations, mutation for the rest; null for both.',
        ),
});

export type ToolSearchApiArgs = z.infer<typeof toolSearchApiArgsSchema>;

export const generativeUiOperationKindSchema = z.enum(['query', 'mutation']);

export const toolSearchApiStructuredContentSchema = z.object({
    operations: z
        .array(
            z.object({
                operationId: z.string(),
                method: generativeUiHttpMethodSchema,
                pathTemplate: z.string(),
                kind: generativeUiOperationKindSchema,
                summary: z.string().nullable(),
            }),
        )
        .describe('Best matches first; empty when nothing matches.'),
});

export type ToolSearchApiStructuredContent = z.infer<
    typeof toolSearchApiStructuredContentSchema
>;

export const toolSearchApiOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolSearchApiStructuredContentSchema,
});

export type ToolSearchApiOutput = z.infer<typeof toolSearchApiOutputSchema>;
