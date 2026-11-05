import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_SEARCH_SEMANTIC_LAYER_DESCRIPTION = `Tool: searchSemanticLayer

Purpose:
Search or list metrics and dimensions across every explore at once, as one flat, paginated inventory, so you can compare names, labels and descriptions across the whole project: an inventory, duplicate or confusingly similar metrics, which explores define a "revenue" metric. To find the fields that answer a data question, use grepFields, which groups matches by explore.
`;

export const toolSearchSemanticLayerArgsSchema = createToolSchema()
    .extend({
        searchQuery: z
            .string()
            .nullable()
            .describe(
                'Keyword to full-text search field names, labels and descriptions across all explores. Null or empty returns the full inventory.',
            ),
        type: z
            .enum(['metric', 'dimension'])
            .nullable()
            .describe(
                'Return only metrics or only dimensions; null returns both.',
            ),
        pageSize: z.coerce
            .number()
            .positive()
            .nullable()
            .describe(
                'Fields per page (default 200, max 500); null for the default. The result reports totals across all pages. For an overview, the first page and those totals are usually enough; read every page only when the task needs every field, such as a project-wide duplicate audit, with a large pageSize so it takes one or two calls.',
            ),
    })
    .withPagination()
    .build();

export const searchSemanticLayerRankingMetadataSchema = z.object({
    searchQuery: z.string().nullable(),
    type: z.enum(['metric', 'dimension']).nullable(),
    fields: z.array(
        z.object({
            name: z.string(),
            label: z.string(),
            tableName: z.string(),
            fieldType: z.string(),
            searchRank: z.number().nullable().optional(),
            chartUsage: z.number().nullable().optional(),
        }),
    ),
});

export const toolSearchSemanticLayerStructuredContentSchema = z.object({
    pagination: z
        .object({
            page: z.number(),
            pageSize: z.number(),
            totalPageCount: z.number(),
            totalResults: z
                .number()
                .describe(
                    'Matching fields across all pages, not just this one.',
                ),
        })
        .nullable()
        .describe('Null when the search backend reported no page information.'),
    fields: z
        .array(
            z.object({
                name: z.string(),
                label: z.string(),
                exploreName: z
                    .string()
                    .describe('Explore (table) the field is defined in.'),
                fieldType: z.string().describe('"metric" or "dimension".'),
                usageInCharts: z
                    .number()
                    .describe('Number of saved charts using this field.'),
                description: z
                    .string()
                    .nullable()
                    .describe(
                        'Field description, possibly truncated; null when the field has none.',
                    ),
            }),
        )
        .describe('The fields on this page; empty when nothing matched.'),
});

export const toolSearchSemanticLayerOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema.extend({
        ranking: searchSemanticLayerRankingMetadataSchema.optional(),
    }),
    structuredContent: toolSearchSemanticLayerStructuredContentSchema,
});

export type ToolSearchSemanticLayerArgs = z.infer<
    typeof toolSearchSemanticLayerArgsSchema
>;
export type ToolSearchSemanticLayerArgsTransformed =
    ToolSearchSemanticLayerArgs;
export type ToolSearchSemanticLayerStructuredContent = z.infer<
    typeof toolSearchSemanticLayerStructuredContentSchema
>;
export type ToolSearchSemanticLayerOutput = z.infer<
    typeof toolSearchSemanticLayerOutputSchema
>;
