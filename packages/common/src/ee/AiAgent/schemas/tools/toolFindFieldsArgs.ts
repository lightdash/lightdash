import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_FIELDS_DESCRIPTION = `Tool: "findFields"

Purpose:
Searches for candidate Fields (Metrics & Dimensions) within an Explore when you are not yet sure which exact field id to use. Returns ranked field matches with full, untruncated descriptions.

Usage tips:
- Use "findExplores" first to discover the relevant Explore, then use this tool to search fields inside it.
- Use full field labels in search terms (e.g. "Total Revenue", "Order Date").
- Pass all needed candidate searches in one request.
- Fields are sorted by relevance, with a maximum score of 1 and a minimum of 0, so the top results are the most relevant.
- If results aren't relevant, retry with clearer or more specific terms.
- Results are paginated — use the next page token to get more results if needed.
- Field descriptions are full, untruncated catalog descriptions.
- Returned field ids are exact and can be used directly in follow-up query construction.
`;

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
            label: z.string(),
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

export const toolFindFieldsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        ranking: findFieldsRankingMetadataSchema.optional(),
    }),
});

export type ToolFindFieldsArgs = z.infer<typeof toolFindFieldsArgsSchema>;
export type ToolFindFieldsArgsTransformed = ToolFindFieldsArgs;
export type ToolFindFieldsOutput = z.infer<typeof toolFindFieldsOutputSchema>;
