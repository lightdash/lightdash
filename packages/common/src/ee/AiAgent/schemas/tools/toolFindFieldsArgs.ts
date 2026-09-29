import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';
import { toolNameFor } from './discoveryToolNames';

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const TOOL_FIND_FIELDS_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => {
    const findExplores = toolNameFor('findExplores', runtime);
    return `Tool: "${toolName}"

Purpose:
Finds the most relevant Fields (Metrics & Dimensions) within Explores, returning detailed info about each.

Usage tips:
- Use "${findExplores}" first to discover available Explores and their field labels.
- Use full field labels in search terms (e.g. "Total Revenue", "Order Date").
- Pass all needed fields in one request.
- Fields are sorted by relevance, with a maximum score of 1 and a minimum of 0, so the top results are the most relevant.
- If results aren't relevant, retry with clearer or more specific terms.
- Results are paginated — use the next page token to get more results if needed.
`;
};

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const toolFindFieldsArgsSchema = createToolSchema()
    .extend({
        table: z.string().describe('The table to search in.'),
        fieldSearchQueries: z.array(
            z.object({
                label: z.string().describe('Full field label'),
            }),
        ),
    })
    .withPagination()
    .build();

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const toolFindFieldsArgsSchemaTransformed = toolFindFieldsArgsSchema;

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const findFieldsRankingMetadataSchema = z.object({
    searchQueries: z.array(
        z.object({
            status: z.enum(['success', 'error']).optional(),
            label: z.string(),
            error: z.string().optional(),
            results: z.array(
                z.object({
                    name: z.string(),
                    label: z.string(),
                    tableName: z.string(),
                    fieldType: z.string(),
                    searchRank: z.number().nullable().optional(),
                    chartUsage: z.number().nullable().optional(),
                    verifiedChartUsage: z.number().nullable().optional(),
                }),
            ),
            pagination: z
                .object({
                    page: z.number(),
                    pageSize: z.number(),
                    totalResults: z.number(),
                    totalPageCount: z.number(),
                })
                .optional(),
        }),
    ),
});

const findFieldsSearchSuccessSchema = z.object({
    status: z.literal('success'),
    searchQuery: z.string(),
    page: z.number().nullable(),
    pageSize: z.number().nullable(),
    totalPageCount: z.number().nullable(),
    totalResults: z.number().nullable(),
    fields: z.array(
        z.object({
            type: z.string(),
            baseTable: z.string(),
            name: z.string(),
            fieldId: z.string(),
            fieldType: z.string(),
            fieldFilterType: z.string(),
            searchRank: z.number().nullable().optional(),
            chartUsage: z.number().nullable().optional(),
            usageInVerifiedCharts: z.number(),
            isFromJoinedTable: z.boolean(),
            caseSensitiveFilters: z.boolean().nullable(),
            note: z.string().nullable(),
            label: z.string(),
            aiHints: z.array(z.string()),
            description: z.string().nullable(),
            categories: z.array(z.string()),
            emoji: z.string().nullable(),
        }),
    ),
});

const findFieldsSearchErrorSchema = z.object({
    status: z.literal('error'),
    searchQuery: z.string(),
    error: z.string(),
});

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const toolFindFieldsStructuredContentSchema = z.object({
    searchResults: z.array(
        z.discriminatedUnion('status', [
            findFieldsSearchSuccessSchema,
            findFieldsSearchErrorSchema,
        ]),
    ),
});

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const toolFindFieldsMetadataSchema = baseOutputMetadataSchema.extend({
    ranking: findFieldsRankingMetadataSchema.optional(),
});

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const toolFindFieldsOutputSchema = structuredToolOutputSchema({
    metadata: toolFindFieldsMetadataSchema,
    structuredContent: toolFindFieldsStructuredContentSchema,
});

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export const isToolFindFieldsResult = makeBuiltInToolResultGuard(
    'findFields',
    toolFindFieldsMetadataSchema,
);

/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export type ToolFindFieldsArgs = z.infer<typeof toolFindFieldsArgsSchema>;
/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export type ToolFindFieldsArgsTransformed = ToolFindFieldsArgs;
/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export type ToolFindFieldsStructuredContent = z.infer<
    typeof toolFindFieldsStructuredContentSchema
>;
/** @deprecated Legacy `findFields` tool contract, kept for historical tool calls. */
export type ToolFindFieldsOutput = z.infer<typeof toolFindFieldsOutputSchema>;
