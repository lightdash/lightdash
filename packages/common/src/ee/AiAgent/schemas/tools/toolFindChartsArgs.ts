import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_CHARTS_DESCRIPTION = `Tool: "findCharts"
Purpose:
Finds charts by name or description within a project, returning detailed info about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns")
- The search engine understands natural language and context - more words provide better results
- You can provide multiple search queries to search for different chart topics simultaneously
- If results aren't relevant, retry with the full user query or more specific terms
- Results are paginated — use the page parameter to get more results if needed
- Returns chart URLs when available
`;

export const toolFindChartsArgsSchema = createToolSchema({
    description: TOOL_FIND_CHARTS_DESCRIPTION,
})
    .extend({
        chartSearchQueries: z.array(
            z.object({
                label: z
                    .string()
                    .describe(
                        'Full search query from the user (e.g., "revenue based on campaigns" not just "campaigns"). Include full context for better results.',
                    ),
            }),
        ),
    })
    .withPagination()
    .build();

export type ToolFindChartsArgs = z.infer<typeof toolFindChartsArgsSchema>;

export const toolFindChartsArgsSchemaTransformed = toolFindChartsArgsSchema;

export type ToolFindChartsArgsTransformed = ToolFindChartsArgs;

export const toolFindChartsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFindChartsOutput = z.infer<typeof toolFindChartsOutputSchema>;
