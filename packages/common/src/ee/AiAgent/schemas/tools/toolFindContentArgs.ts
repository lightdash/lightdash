import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const getToolFindContentDescription = ({
    name,
    getDashboardChartsName,
}: {
    name: string;
    getDashboardChartsName?: string;
}) => `Tool: ${name}

Purpose:
Finds charts or dashboards by name or description within a project, returning detailed information about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns").
- The search engine understands natural language and context — more descriptive queries yield better results.
- You can provide multiple search queries to look for different topics simultaneously (e.g., ["monthly revenue", "user acquisition trends"]).
- If results aren't relevant, retry with the full user query or more specific terms.
- Dashboards with validation errors will be deprioritized.
- Returns chart and dashboard URLs when available.
- Dashboards show a preview of the first 5 charts and the total chart count.${getDashboardChartsName ? ` Use "${getDashboardChartsName}" to see all charts for a specific dashboard.` : ''}
- It doesn't provide summaries for dashboards yet, so don't suggest this capability.`;

const toolFindContentOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const findContentTool = defineTool({
    canonicalName: 'findContent',
    title: 'Find Content',
    contexts: ['agent', 'mcp'] as const,
    description: {
        agent: ({ name }) =>
            getToolFindContentDescription({
                getDashboardChartsName: 'getDashboardCharts',
                name,
            }),
        mcp: ({ name }) => getToolFindContentDescription({ name }),
    },
    buildInputSchemas: {
        agent: ({ createSchema }) =>
            createSchema()
                .extend({
                    searchQueries: z.array(
                        z.object({
                            label: z
                                .string()
                                .describe(
                                    'Full search query from the user (e.g., "revenue based on campaigns" not just "campaigns"). Include full context for better results.',
                                ),
                        }),
                    ),
                })
                .build(),
        mcp: ({ createSchema }) =>
            createSchema()
                .extend({
                    searchQueries: z.array(
                        z.object({
                            label: z
                                .string()
                                .describe(
                                    'Full search query from the user (e.g., "revenue based on campaigns" not just "campaigns"). Include full context for better results.',
                                ),
                        }),
                    ),
                })
                .build(),
    },
    outputSchema: toolFindContentOutputSchema,
});

export type ToolFindContentArgs = ToolInput<typeof findContentTool, 'agent'>;
export type ToolFindContentArgsTransformed = ToolFindContentArgs;
export type ToolFindContentOutput = ToolOutput<typeof findContentTool>;
