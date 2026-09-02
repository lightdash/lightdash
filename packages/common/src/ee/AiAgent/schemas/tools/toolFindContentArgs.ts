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
Finds spaces, charts, dashboards, or Data Apps by name or description within a project, returning detailed information about each.

Usage tips:
- IMPORTANT: Pass the user's full query or relevant portion directly (e.g., "revenue based on campaigns" instead of just "campaigns").
- The search engine understands natural language and context — more descriptive queries yield better results.
- You can provide multiple search queries to look for different topics simultaneously (e.g., ["monthly revenue", "user acquisition trends"]).
- Pass spaceSlug to search only inside that space and its descendants.
- verifiedOnly=true searches only admin-verified charts/dashboards (spaces omitted). Data Apps have no verification state and remain included. Verification is a status, not text — search topic keywords, never the word "verified". If nothing matches, verified content may still exist under other terms, so never claim the project has none from one query. Re-run with verifiedOnly=false only if unverified charts or dashboards are acceptable.
- If results aren't relevant, retry with the full user query or more specific terms.
- Dashboards with validation errors will be deprioritized.
- Returns space breadcrumb/path metadata and canonical chart, dashboard, and Data App URLs when available.
- Dashboards show a preview of the first 5 charts and the total chart count. Use "${dashboardDetailsToolName}" to see all charts for a specific dashboard.
${
    dashboardDetailsToolName === 'getDashboardCharts'
        ? ''
        : `- Data Apps are readable: call "${dashboardDetailsToolName}" with type "data_app" and the app slug to see what the app shows, the charts and dashboard it was generated from, and the explores, fields, filters, parameters and external connections it queries.
`
}- It doesn't provide summaries for dashboards yet, so don't suggest this capability.`;

export const TOOL_FIND_CONTENT_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string =>
    getFindContentToolDescription({
        toolName,
        dashboardDetailsToolName:
            runtime === 'mcp' ? 'read_content' : 'readContent',
    }) +
    (runtime === 'mcp'
        ? '\n- If query-execution tools (run_metric_query, run_sql) are NOT available in this session, use this tool FIRST: saved charts and dashboards often already answer the question. Never tell the user information is unavailable, and never suggest raw SQL or elevated permissions, before searching here.'
        : '');

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
                'Set to true to search only admin-verified charts and dashboards; matching Data Apps remain included because they have no verification state. Null or false searches all content.',
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
