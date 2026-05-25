import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const inputSchema = createToolSchema()
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

const outputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

/** @deprecated Superseded by `findContent`; kept to render historical tool calls and for eval coverage. */
export const findChartsTool = defineTool({
    name: 'findCharts',
    title: 'Find Charts',
    description: (name) => `Tool: "${name}"
Purpose:
Finds charts by name or description within a project, returning detailed info about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns")
- The search engine understands natural language and context - more words provide better results
- You can provide multiple search queries to search for different chart topics simultaneously
- If results aren't relevant, retry with the full user query or more specific terms
- Results are paginated — use the page parameter to get more results if needed
- Returns chart URLs when available
`,
    availability: 'agent',
    inputSchema,
    agent: { outputSchema },
});
