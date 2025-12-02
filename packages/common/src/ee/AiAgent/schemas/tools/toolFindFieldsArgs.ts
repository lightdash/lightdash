import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_FIELDS_DESCRIPTION = `Tool: "findFields"

Purpose:
Finds the most relevant Fields (Metrics & Dimensions) within Explores, returning detailed info about each.

Usage tips:
- Use "findExplores" first to discover available Explores and their field labels.
- Use full field labels in search terms (e.g. "Total Revenue", "Order Date").
- Pass all needed fields in one request.
- Fields are sorted by relevance, with a maximum score of 1 and a minimum of 0, so the top results are the most relevant.
- If results aren't relevant, retry with clearer or more specific terms.
- Results are paginated — use the next page token to get more results if needed.
`;

export const toolFindFieldsArgsSchema = createToolSchema({
    description: TOOL_FIND_FIELDS_DESCRIPTION,
})
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
