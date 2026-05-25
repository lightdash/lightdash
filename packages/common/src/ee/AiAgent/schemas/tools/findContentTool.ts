import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const toolFindContentArgsSchema = createToolSchema()
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
    .build();

const toolFindContentOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const findContentTool = defineTool({
    name: 'findContent',
    title: 'Find Content',
    description: (name) => `Tool: "${name}"
Purpose:
Finds charts or dashboards by name or description within a project, returning detailed information about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns").
- The search engine understands natural language and context — more descriptive queries yield better results.
- You can provide multiple search queries to look for different topics simultaneously (e.g., ["monthly revenue", "user acquisition trends"]).
- If results aren't relevant, retry with the full user query or more specific terms.
- Dashboards with validation errors will be deprioritized.
- Returns chart and dashboard URLs when available.
- Dashboards show a preview of the first 5 charts and the total chart count. Use "getDashboardCharts" to see all charts for a specific dashboard.
- It doesn't provide summaries for dashboards yet, so don't suggest this capability.`,
    availability: 'both',
    inputSchema: toolFindContentArgsSchema,
    agent: { outputSchema: toolFindContentOutputSchema },
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
});
