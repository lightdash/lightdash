import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { toolNameFor } from './discoveryToolNames';

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

export const toolFindFieldsArgsSchemaTransformed = toolFindFieldsArgsSchema;

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
    searchQuery: z.string().describe('The field label that was searched for.'),
    page: z.number().nullable(),
    pageSize: z.number().nullable(),
    totalPageCount: z.number().nullable(),
    totalResults: z
        .number()
        .nullable()
        .describe('Total matches across all pages.'),
    fields: z.array(
        z.object({
            type: z
                .string()
                .describe('Whether the field is a "metric" or a "dimension".'),
            baseTable: z.string().describe('Table the field belongs to.'),
            name: z.string(),
            fieldId: z
                .string()
                .describe(
                    'Identifier to use in queries and filters (`<table>_<name>`).',
                ),
            fieldType: z
                .string()
                .describe('Value type (e.g. string, number, date, sum).'),
            fieldFilterType: z
                .string()
                .describe('Filter type the field accepts.'),
            searchRank: z
                .number()
                .nullable()
                .optional()
                .describe('Relevance score between 0 and 1.'),
            chartUsage: z
                .number()
                .nullable()
                .optional()
                .describe('Number of saved charts using the field.'),
            usageInVerifiedCharts: z
                .number()
                .describe('Number of verified charts using the field.'),
            isFromJoinedTable: z
                .boolean()
                .describe('True when the field comes from a joined table.'),
            caseSensitiveFilters: z
                .boolean()
                .nullable()
                .describe(
                    'Whether string filters are case-sensitive; null for non-string fields.',
                ),
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
    searchQuery: z.string().describe('The field label that was searched for.'),
    error: z.string(),
});

export const toolFindFieldsStructuredContentSchema = z.object({
    searchResults: z
        .array(
            z.discriminatedUnion('status', [
                findFieldsSearchSuccessSchema,
                findFieldsSearchErrorSchema,
            ]),
        )
        .describe('One entry per requested search query, in request order.'),
});

export const toolFindFieldsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema.extend({
        ranking: findFieldsRankingMetadataSchema.optional(),
    }),
    structuredContent: toolFindFieldsStructuredContentSchema,
});

export type ToolFindFieldsArgs = z.infer<typeof toolFindFieldsArgsSchema>;
export type ToolFindFieldsArgsTransformed = ToolFindFieldsArgs;
export type ToolFindFieldsStructuredContent = z.infer<
    typeof toolFindFieldsStructuredContentSchema
>;
export type ToolFindFieldsOutput = z.infer<typeof toolFindFieldsOutputSchema>;
