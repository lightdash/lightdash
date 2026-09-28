import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
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
        ? '\n- If neither run_metric_query nor run_sql is available, search here FIRST: saved charts/dashboards may answer the question. Search before claiming information is unavailable or suggesting raw SQL or elevated permissions.'
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

const findContentSpaceMetadataSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    slug: z.string(),
    breadcrumb: z
        .string()
        .describe('Space path from the root, space names joined by " / ".'),
});

const findContentVerificationSchema = z
    .object({
        verifiedBy: z
            .string()
            .describe('Full name of the admin who verified the content.'),
        verifiedAt: z.string().describe('ISO 8601 verification timestamp.'),
    })
    .nullable()
    .describe('Admin verification, or null when the content is unverified.');

const findContentUserNameSchema = z
    .string()
    .nullable()
    .describe('Full name of the user, or null when unknown.');

const findContentTimestampSchema = z
    .string()
    .nullable()
    .describe('ISO 8601 timestamp, or null when unknown.');

const findContentDescriptionSchema = z
    .string()
    .nullable()
    .describe('Description truncated to the tool limit, or null when empty.');

export const findContentDocumentItemSchema = z.object({
    contentType: z.literal('document'),
    uuid: z.string(),
    name: z.string(),
    slug: z.string(),
    href: z.string(),
    description: findContentDescriptionSchema,
});

export const findContentSpaceItemSchema = z.object({
    contentType: z.literal('space'),
    uuid: z.string(),
    name: z.string(),
    slug: z.string(),
    searchRank: z.number(),
    chartCount: z.number().int(),
    dashboardCount: z.number().int(),
    childSpaceCount: z.number().int(),
    appCount: z.number().int(),
    directAccess: z
        .boolean()
        .describe('Whether the user has direct access to this space.'),
    space: findContentSpaceMetadataSchema,
});

export const findContentDataAppItemSchema = z.object({
    contentType: z.literal('data_app'),
    uuid: z.string(),
    name: z.string(),
    slug: z.string(),
    searchRank: z.number(),
    spaceUuid: z
        .string()
        .nullable()
        .describe('Null for personal apps that live outside any space.'),
    viewsCount: z.number().int(),
    href: z.string().describe('Canonical viewer URL of the Data App.'),
    space: findContentSpaceMetadataSchema.nullable(),
    description: findContentDescriptionSchema,
    createdBy: findContentUserNameSchema,
});

const findContentDashboardChartPreviewSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    chartType: z.string(),
    description: findContentDescriptionSchema,
    verification: findContentVerificationSchema,
});

export const findContentDashboardItemSchema = z.object({
    contentType: z.literal('dashboard'),
    uuid: z.string(),
    name: z.string(),
    slug: z.string(),
    searchRank: z.number(),
    spaceUuid: z.string(),
    viewsCount: z.number().int(),
    href: z.string().describe('Canonical URL of the dashboard.'),
    space: findContentSpaceMetadataSchema,
    description: findContentDescriptionSchema,
    verification: findContentVerificationSchema,
    firstViewedAt: findContentTimestampSchema,
    lastModified: findContentTimestampSchema,
    createdBy: findContentUserNameSchema,
    lastUpdatedBy: findContentUserNameSchema,
    charts: z.object({
        count: z
            .number()
            .int()
            .describe('Total number of charts on the dashboard.'),
        preview: z
            .array(findContentDashboardChartPreviewSchema)
            .describe(
                'First few charts, verified first; use readContent for the full list.',
            ),
    }),
    validationErrorCount: z
        .number()
        .int()
        .describe(
            'Number of validation errors; dashboards with errors are deprioritized.',
        ),
});

export const findContentChartItemSchema = z.object({
    contentType: z.literal('chart'),
    uuid: z.string(),
    name: z.string(),
    slug: z.string(),
    searchRank: z.number(),
    chartType: z.string(),
    chartSource: z
        .enum(['saved', 'sql'])
        .describe('"saved" for explore charts, "sql" for SQL Runner charts.'),
    spaceUuid: z.string(),
    viewsCount: z.number().int(),
    href: z.string().describe('Canonical URL of the chart.'),
    space: findContentSpaceMetadataSchema,
    description: findContentDescriptionSchema,
    verification: findContentVerificationSchema,
    firstViewedAt: findContentTimestampSchema,
    lastModified: findContentTimestampSchema,
    createdBy: findContentUserNameSchema,
    lastUpdatedBy: findContentUserNameSchema,
});

const findContentItemSchema = z.discriminatedUnion('contentType', [
    findContentDocumentItemSchema,
    findContentSpaceItemSchema,
    findContentDataAppItemSchema,
    findContentDashboardItemSchema,
    findContentChartItemSchema,
]);

const findContentSearchResultSchema = z.object({
    searchQuery: z.string(),
    verifiedOnly: z.boolean(),
    count: z.number().int().describe('Number of matches for this query.'),
    note: z
        .string()
        .nullable()
        .describe(
            'Guidance when a verifiedOnly search matched nothing; null otherwise.',
        ),
    content: z
        .array(findContentItemSchema)
        .describe('Matches for this query, verified content first.'),
});

export const toolFindContentStructuredContentSchema = z.object({
    searchResults: z
        .array(findContentSearchResultSchema)
        .describe('One entry per search query, in the order given.'),
});

export const toolFindContentOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolFindContentStructuredContentSchema,
});

export type ToolFindContentArgs = z.infer<typeof toolFindContentArgsSchema>;
export type ToolFindContentArgsTransformed = ToolFindContentArgs;
export type ToolFindContentStructuredContent = z.infer<
    typeof toolFindContentStructuredContentSchema
>;
export type ToolFindContentOutput = z.infer<typeof toolFindContentOutputSchema>;
