import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const toolFindFieldsArgsSchema = createToolSchema()
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

const toolFindFieldsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        ranking: findFieldsRankingMetadataSchema.optional(),
    }),
});

export const findFieldsTool = defineTool({
    name: 'findFields',
    title: 'Find Fields',
    description: (name) => `Tool: "${name}"

Purpose:
Finds the most relevant Fields (Metrics & Dimensions) within Explores, returning detailed info about each.

Usage tips:
- Use "findExplores" first to discover available Explores and their field labels.
- Use full field labels in search terms (e.g. "Total Revenue", "Order Date").
- Pass all needed fields in one request.
- Fields are sorted by relevance, with a maximum score of 1 and a minimum of 0, so the top results are the most relevant.
- If results aren't relevant, retry with clearer or more specific terms.
- Results are paginated — use the next page token to get more results if needed.
`,
    availability: 'both',
    inputSchema: toolFindFieldsArgsSchema,
    agent: { outputSchema: toolFindFieldsOutputSchema },
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
