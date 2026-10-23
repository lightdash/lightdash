import { z } from 'zod';
import { type ToolDescriptionContext, type ToolRuntime } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

type FindContentDashboardDetailsToolName =
    | 'getDashboardCharts'
    | 'readContent'
    | 'read_content';

// Agent only: the MCP instructions have no verified-content policy to pair it with.
const verifiedMarkupGuidanceByRuntime = {
    agent: `- A result carrying a \`<verified by="..." at="..." />\` element was approved by an organization or project admin as canonical, trustworthy content; \`by\` names who verified it and \`at\` says when. Verification is per item: a chart inside a verified dashboard is verified only when it carries its own \`<verified>\` element.
`,
    mcp: '',
} satisfies Record<ToolRuntime, string>;

export const getFindContentToolDescription = ({
    runtime,
    toolName,
    dashboardDetailsToolName,
}: {
    runtime: ToolRuntime;
    toolName: string;
    dashboardDetailsToolName: FindContentDashboardDetailsToolName;
}): string => `Tool: "${toolName}"
Purpose:
Finds spaces, charts, dashboards, or Data Apps by name or description within a project, returning detailed information about each.

Usage tips:
- If results aren't relevant, retry with the full user query or more specific terms.
${verifiedMarkupGuidanceByRuntime[runtime]}- A dashboard result previews at most its first 5 charts; use "${dashboardDetailsToolName}" to see all of them.`;

export const TOOL_FIND_CONTENT_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string =>
    getFindContentToolDescription({
        runtime,
        toolName,
        dashboardDetailsToolName:
            runtime === 'mcp' ? 'read_content' : 'readContent',
    }) +
    (runtime === 'mcp'
        ? '\n- If neither run_metric_query nor run_sql is available, search here first: saved charts/dashboards may answer the question. Search before claiming information is unavailable or suggesting raw SQL or elevated permissions.'
        : '');

export const toolFindContentArgsSchema = createToolSchema()
    .extend({
        searchQueries: z
            .array(
                z.object({
                    label: z
                        .string()
                        .describe(
                            'The user\'s full request or its relevant part ("revenue based on campaigns", not just "campaigns"): the search understands natural language, so more context matches better.',
                        ),
                }),
            )
            .describe(
                'Searches run together; pass several to cover different topics at once (e.g. "monthly revenue" and "user acquisition trends").',
            ),
        spaceSlug: z
            .string()
            .nullable()
            .describe(
                'Space slug or path to search only inside that space and its descendants, or null to search the whole project.',
            ),
        verifiedOnly: z
            .boolean()
            .nullish()
            .describe(
                'True searches only admin-verified charts and dashboards; spaces are omitted, and Data Apps stay included because they have no verification state. Verification is a status, not text, so search topic keywords rather than the word "verified". Null or false searches all content.',
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
        verifiedAgo: z.string(),
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
    .describe(
        'Description truncated to the rendered limit, or null when empty.',
    );

export const findContentDocumentItemSchema = z.object({
    contentType: z.literal('document'),
    uuid: z.string(),
    name: z.string(),
    slug: z.string(),
    href: z.string(),
    description: findContentDescriptionSchema,
    space: findContentSpaceMetadataSchema.nullable(),
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
    firstViewedAgo: z.string().nullable(),
    lastModified: findContentTimestampSchema,
    lastModifiedAgo: z.string().nullable(),
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
    firstViewedAgo: z.string().nullable(),
    lastModified: findContentTimestampSchema,
    lastModifiedAgo: z.string().nullable(),
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

const findContentCompactItemSchema = z.discriminatedUnion('contentType', [
    findContentDocumentItemSchema,
    findContentSpaceItemSchema,
    findContentDataAppItemSchema.omit({
        searchRank: true,
        viewsCount: true,
        createdBy: true,
    }),
    findContentDashboardItemSchema
        .omit({
            searchRank: true,
            viewsCount: true,
            firstViewedAt: true,
            firstViewedAgo: true,
            lastModified: true,
            lastModifiedAgo: true,
            createdBy: true,
            lastUpdatedBy: true,
        })
        .extend({
            charts: findContentDashboardItemSchema.shape.charts.pick({
                count: true,
            }),
        }),
    findContentChartItemSchema.omit({
        searchRank: true,
        viewsCount: true,
        firstViewedAt: true,
        firstViewedAgo: true,
        lastModified: true,
        lastModifiedAgo: true,
        createdBy: true,
        lastUpdatedBy: true,
    }),
]);

const findContentSearchResultSchema = z.object({
    searchQuery: z.string(),
    count: z.number().int().describe('Number of matches for this query.'),
    note: z
        .string()
        .nullable()
        .describe(
            'Guidance when a verifiedOnly search matched nothing; null otherwise.',
        ),
    truncationNote: z.string().nullable(),
    content: z
        .array(findContentItemSchema)
        .describe(
            'Matches for this query, in the order rendered in the result.',
        ),
});

const findContentCompactSearchResultSchema =
    findContentSearchResultSchema.extend({
        content: z
            .array(findContentCompactItemSchema)
            .describe(
                'Matches for this query, in the order rendered in the result.',
            ),
    });

export const toolFindContentStructuredContentSchema = z.object({
    searchResults: z
        .array(
            z.union([
                findContentSearchResultSchema,
                findContentCompactSearchResultSchema,
            ]),
        )
        .describe('One entry per search query, in the order given.'),
});

export const toolFindContentOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolFindContentStructuredContentSchema,
});

export type ToolFindContentArgs = z.infer<typeof toolFindContentArgsSchema>;
export type ToolFindContentArgsTransformed = ToolFindContentArgs;
export type ToolFindContentSearchResult = z.infer<
    typeof findContentSearchResultSchema
>;
export type ToolFindContentCompactSearchResult = z.infer<
    typeof findContentCompactSearchResultSchema
>;
export type ToolFindContentStructuredContent = z.infer<
    typeof toolFindContentStructuredContentSchema
>;
export type ToolFindContentOutput = z.infer<typeof toolFindContentOutputSchema>;
