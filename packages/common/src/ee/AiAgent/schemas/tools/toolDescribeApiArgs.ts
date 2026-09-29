import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { generativeUiHttpMethodSchema } from './toolGenerateUiArgs';
import { generativeUiOperationKindSchema } from './toolSearchApiArgs';

export const TOOL_DESCRIBE_API_DESCRIPTION =
    'Show one operation from searchApi as a compact TypeScript-like signature: path and query parameters, request body, and the response `results` that $query and $result paths read. projectUuid path parameters are filled in automatically; never set them.';

export const toolDescribeApiArgsSchema = z.object({
    operationId: z
        .string()
        .min(1)
        .max(100)
        .describe('An operationId returned by searchApi.'),
});

export type ToolDescribeApiArgs = z.infer<typeof toolDescribeApiArgsSchema>;

export const toolDescribeApiStructuredContentSchema = z.object({
    operationId: z.string(),
    method: generativeUiHttpMethodSchema,
    pathTemplate: z.string(),
    kind: generativeUiOperationKindSchema,
    summary: z.string().nullable(),
    pathParams: z
        .array(z.string())
        .describe('Path parameters a card must set in params.path.'),
    autoFilledPathParams: z
        .array(z.string())
        .describe('Path parameters filled in from the conversation.'),
    signature: z
        .string()
        .describe('Parameters, body and response results as TypeScript.'),
});

export type ToolDescribeApiStructuredContent = z.infer<
    typeof toolDescribeApiStructuredContentSchema
>;

export const toolDescribeApiOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolDescribeApiStructuredContentSchema,
});

export type ToolDescribeApiOutput = z.infer<typeof toolDescribeApiOutputSchema>;
