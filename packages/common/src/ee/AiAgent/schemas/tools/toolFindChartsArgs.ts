import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const getToolFindChartsDescription = ({
    name,
}: {
    name: string;
}) => `Tool: ${name}

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

const toolFindChartsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const findChartsTool = defineTool({
    canonicalName: 'findCharts',
    title: 'Find Charts',
    contexts: ['agent'] as const,
    description: {
        agent: getToolFindChartsDescription,
    },
    buildInputSchemas: {
        agent: ({ createSchema }) =>
            createSchema()
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
                .build(),
    },
    outputSchema: toolFindChartsOutputSchema,
});

export type ToolFindChartsArgs = ToolInput<typeof findChartsTool, 'agent'>;
export type ToolFindChartsArgsTransformed = ToolFindChartsArgs;
export type ToolFindChartsOutput = ToolOutput<typeof findChartsTool>;
