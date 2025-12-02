import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_DASHBOARDS_DESCRIPTION = `Tool: "findDashboards"
Purpose:
Finds dashboards by name or description within a project, returning detailed info about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns")
- The search engine understands natural language and context - more words provide better results
- You can provide multiple search queries to search for different dashboard topics simultaneously
- If results aren't relevant, retry with the full user query or more specific terms
- Results are paginated — use the page parameter to get more results if needed
- Dashboards with validation errors will be deprioritized
- Returns dashboard URLs when available
- It doesn't provide a dashboard summary yet, so don't suggest this capability
`;

export const toolFindDashboardsArgsSchema = createToolSchema({
    description: TOOL_FIND_DASHBOARDS_DESCRIPTION,
})
    .extend({
        dashboardSearchQueries: z.array(
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

export type ToolFindDashboardsArgs = z.infer<
    typeof toolFindDashboardsArgsSchema
>;

export const toolFindDashboardsArgsSchemaTransformed =
    toolFindDashboardsArgsSchema;

export type ToolFindDashboardsArgsTransformed = ToolFindDashboardsArgs;

export const toolFindDashboardsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFindDashboardsOutput = z.infer<
    typeof toolFindDashboardsOutputSchema
>;
