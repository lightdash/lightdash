import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

type FindContentDashboardDetailsToolName =
    | 'getDashboardCharts'
    | 'readContent'
    | 'read_content';

export const getFindContentToolDescription = ({
    toolName,
    dashboardDetailsToolName,
}: {
    toolName: string;
    dashboardDetailsToolName: FindContentDashboardDetailsToolName;
}): string => `Tool: "${toolName}"
Purpose:
Finds spaces, charts, or dashboards by name or description within a project, returning detailed information about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns").
- The search engine understands natural language and context — more descriptive queries yield better results.
- You can provide multiple search queries to look for different topics simultaneously (e.g., ["monthly revenue", "user acquisition trends"]).
- Pass spaceSlug to search only inside that space and its descendants.
- verifiedOnly=true searches only admin-verified charts/dashboards (spaces omitted). Verification is a status, not text — search topic keywords, never the word "verified". If nothing verified matches, the result is empty; verified content may still exist under other terms, so never claim the project has none from one query. Re-run with verifiedOnly=false only if unverified content is acceptable.
- If results aren't relevant, retry with the full user query or more specific terms.
- Dashboards with validation errors will be deprioritized.
- Returns space breadcrumb/path metadata and chart/dashboard URLs when available.
- Dashboards show a preview of the first 5 charts and the total chart count. Use "${dashboardDetailsToolName}" to see all charts for a specific dashboard.
- It doesn't provide summaries for dashboards yet, so don't suggest this capability.`;

export const TOOL_FIND_CONTENT_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string =>
    getFindContentToolDescription({
        toolName,
        dashboardDetailsToolName:
            runtime === 'mcp' ? 'read_content' : 'readContent',
    });

export const toolFindContentArgsSchema = createToolSchema()
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
        spaceSlug: z
            .string()
            .nullable()
            .describe(
                'Optional space slug/path. Use null to search the whole project. When set, only content in this space and descendants is returned.',
            ),
        verifiedOnly: z
            .boolean()
            .nullish()
            .describe(
                'Set to true to search only admin-verified charts and dashboards. Null or false searches all content.',
            ),
    })
    .build();

export const toolFindContentArgsSchemaTransformed = toolFindContentArgsSchema;

export const toolFindContentOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFindContentArgs = z.infer<typeof toolFindContentArgsSchema>;
export type ToolFindContentArgsTransformed = ToolFindContentArgs;
export type ToolFindContentOutput = z.infer<typeof toolFindContentOutputSchema>;
