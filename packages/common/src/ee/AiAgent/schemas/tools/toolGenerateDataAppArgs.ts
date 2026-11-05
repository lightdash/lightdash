import { z } from 'zod';
import {
    APP_VERSION_CANCELLED_BY_USER,
    isAppVersionInProgress,
    type AppVersionStatus,
    type DataAppTemplate,
} from '../../../apps/types';
import {
    toolErrorStructuredContentSchema,
    type ToolErrorStructuredContent,
} from '../outputMetadata';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';

/** Suggested gap between build status polls; a build runs minutes, not seconds. */
export const DATA_APP_BUILD_POLL_INTERVAL_MS = 15_000;

/** Builds run minutes, not seconds: a pending result older than this is stale. */
export const AI_DATA_APP_BUILD_PENDING_GRACE_MS = 30 * 60 * 1000;

/** Builder starter templates the AI agent may pick; the viz renderer template is internal. */
export const DATA_APP_BUILD_TEMPLATES = [
    'dashboard',
    'slideshow',
    'pdf',
    'custom',
] as const satisfies readonly DataAppTemplate[];
export type DataAppBuildTemplate = (typeof DATA_APP_BUILD_TEMPLATES)[number];

/** How a prior visualization's query travels in a build brief. */
export const DATA_APP_VIZ_LINE_FORMAT =
    '[viz title][explore; metrics; dimensions; filters; sort]';

/** Shared by the generate and iterate briefs. */
export const DATA_APP_BRIEF_AUDIENCE =
    'The coding agent explores the semantic layer itself but sees neither this conversation nor its query results.';

/** Shared by the generate and iterate briefs. */
export const DATA_APP_BRIEF_QUERY_GUIDANCE = `Give a visualization as a one-line description and a metric query line \`${DATA_APP_VIZ_LINE_FORMAT}\`, never as numbers: a number in the brief is hardcoded into the app, while a query stays live.`;

/** Shared by generate and iterate; each adds what omitting it does. */
export const DATA_APP_THEME_SLUG_SOURCE =
    'Organization theme slug: the one the attached context lists ("Theme: <name> (slug: <slug>)"), which beats a theme named in the message, or else, when the user names a theme, brand or look, one from listDataAppThemes (list_data_app_themes over MCP). The coding agent receives the theme\'s files directly, so set the look here, not in the brief.';

/** Shared by generate and iterate. */
export const DATA_APP_CONNECTION_LINKING =
    'A data app calls an outside API only through a linked connection; naming one in the brief does not link it.';

export const TOOL_GENERATE_DATA_APP_DESCRIPTION =
    'Start a background build of a new data app (an interactive app, a slide show or a PDF report) from a brief.';

/** Why a scoped session loses sight of a personal app; shared by every MCP build tool. */
export const MCP_DATA_APP_AGENT_SCOPE_GUIDANCE =
    '- An agent-scoped session restricted to specific spaces cannot read a personal app. Call this tool and get_data_app_build_status without agentUuid to build and poll an app you own.';

export const MCP_TOOL_GENERATE_DATA_APP_DESCRIPTION = `Tool: generate_data_app

Purpose:
Start building a new data app (an interactive app, a slide show or a PDF report) from a brief, on top of a Lightdash project's semantic layer. Each build produces one version of the app. To change an existing app, use iterate_data_app; charts, dashboards and other saved content have their own tools.

Important:
- The build runs in the background for several minutes, and this call returns once it starts. Call it once per request, then poll get_data_app_build_status with the returned slug until the build ends.
- A name already taken in the project gets a numeric suffix on the slug, so use the slug this call returns, never one derived from the name.
- The app is created as the calling user's personal app: at the project root, in no space, visible only to them until they move it.
${MCP_DATA_APP_AGENT_SCOPE_GUIDANCE}
`;

export const dataAppBuildWarningsSchema = z
    .array(z.string())
    .describe(
        'Non-blocking issues with the request, such as a connection the brief names that the app does not link. Empty when there are none.',
    );

/** What a started build reports at the MCP surface; the app uuid stays internal. */
export const mcpDataAppBuildStartedOutputSchema = z.object({
    slug: z
        .string()
        .describe(
            "The app's permanent slug. Poll get_data_app_build_status with it.",
        ),
    version: z
        .number()
        .int()
        .positive()
        .describe('The version of the app this build produces.'),
    warnings: dataAppBuildWarningsSchema,
});

export type McpDataAppBuildStarted = z.infer<
    typeof mcpDataAppBuildStartedOutputSchema
>;

export const externalConnectionSlugsInput = z
    .array(z.string())
    .nullish()
    .default(null)
    .describe(
        `External connections to link to the app before the build: slugs from listDataAppConnections (list_data_app_connections over MCP). ${DATA_APP_CONNECTION_LINKING} Omit when the app uses no outside API.`,
    );

export const toolGenerateDataAppArgsSchema = z.object({
    name: z
        .string()
        .describe(
            'Display name: a headline-short title in title case naming what the app shows ("Revenue Overview"). It also sets the app\'s permanent slug, so pick the final name now.',
        ),
    prompt: z
        .string()
        .describe(
            `Self-contained brief for the coding agent: what the app shows, for whom, and how it behaves. ${DATA_APP_BRIEF_AUDIENCE} ${DATA_APP_BRIEF_QUERY_GUIDANCE}`,
        ),
    template: z
        .enum(DATA_APP_BUILD_TEMPLATES)
        .nullish()
        .default(null)
        .describe(
            'Starter template: "dashboard" for a dashboard-style app, "slideshow" for a slide show, "pdf" for a PDF report. Omit it, or pass "custom", for anything else.',
        ),
    dashboardSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            "Existing dashboard to start from: its slug, from findContent (find_content over MCP). The app starts from the dashboard's layout and charts; the dashboard stays unchanged.",
        ),
    chartSlugs: z
        .array(z.string())
        .nullish()
        .default(null)
        .describe(
            'Saved charts whose queries the app builds on: slugs from findContent (find_content over MCP). The charts stay unchanged.',
        ),
    themeSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            `${DATA_APP_THEME_SLUG_SOURCE} Omit it for the organization default.`,
        ),
    externalConnectionSlugs: externalConnectionSlugsInput,
});

const versionSchema = z
    .number()
    .describe('App version this build produces; 1 for a new app.');

const pendingBuildSchema = z.object({
    status: z
        .literal('pending')
        .describe(
            'The build has started and is still running; its outcome replaces this result on a later turn.',
        ),
    // Optional: pending results persisted before warnings existed lack it.
    warnings: dataAppBuildWarningsSchema.optional(),
});

const readyBuildSchema = z.object({
    status: z
        .literal('success')
        .describe('The build finished; the app version is ready.'),
    version: versionSchema,
    name: z.string().describe('Name of the data app.'),
});

export const toolGenerateDataAppStructuredContentSchema = z.discriminatedUnion(
    'status',
    [pendingBuildSchema, readyBuildSchema],
);

// Metadata carries a third `pending` status, so it is not the object
// `structuredToolOutputSchema` takes; the envelope is spelled out instead.
export const toolGenerateDataAppOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('pending'),
            appUuid: z.string(),
            version: z.number(),
            // Nullish: iterate results and results persisted before generate
            // took a name lack it.
            name: z.string().nullish(),
        }),
        z.object({
            status: z.literal('success'),
            appUuid: z.string(),
            version: z.number(),
            name: z.string(),
            // Nullish: results persisted before slugs were recorded lack it.
            slug: z.string().nullish(),
            href: z.string(),
        }),
        z.object({
            status: z.literal('error'),
            // Null when the build never started, so no app exists to open.
            appUuid: z.string().nullable(),
            reason: z.enum(['failed', 'cancelled']),
            message: z.string(),
        }),
    ]),
    structuredContent: z.union([
        toolGenerateDataAppStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolGenerateDataAppArgs = z.infer<
    typeof toolGenerateDataAppArgsSchema
>;

export type ToolGenerateDataAppOutput = z.infer<
    typeof toolGenerateDataAppOutputSchema
>;

export type ToolGenerateDataAppStructuredContent = z.infer<
    typeof toolGenerateDataAppStructuredContentSchema
>;

type ToolGenerateDataAppMetadata = ToolGenerateDataAppOutput['metadata'];

export type ToolGenerateDataAppTerminalResult =
    | {
          result: string;
          metadata: Extract<ToolGenerateDataAppMetadata, { status: 'success' }>;
          structuredContent: Extract<
              ToolGenerateDataAppStructuredContent,
              { status: 'success' }
          >;
      }
    | {
          result: string;
          metadata: Extract<ToolGenerateDataAppMetadata, { status: 'error' }>;
          structuredContent: ToolErrorStructuredContent;
      };

export const isToolGenerateDataAppResult = makeBuiltInToolResultGuard(
    'generateDataApp',
    toolGenerateDataAppOutputSchema.shape.metadata,
);

export const getDataAppBuilderPath = (
    projectUuid: string,
    appUuidOrSlug: string,
) => `/projects/${projectUuid}/apps/${appUuidOrSlug}`;

// Terminal tool result for a version, or null while still building. Shared by
// the worker patch and the thread-read self-heal.
export const getGenerateDataAppBuildOutcome = ({
    siteUrl,
    projectUuid,
    appUuid,
    version,
    name,
    slug,
    status,
    error,
    statusMessage,
}: {
    siteUrl: string;
    projectUuid: string;
    appUuid: string;
    version: number;
    name: string;
    slug: string | null;
    status: AppVersionStatus;
    error: string | null;
    statusMessage: string | null;
}): ToolGenerateDataAppTerminalResult | null => {
    if (isAppVersionInProgress(status)) {
        return null;
    }
    if (status === 'ready') {
        // Canonical URL, kept in metadata for Slack outcomes and cards.
        const href = `${siteUrl}${getDataAppBuilderPath(projectUuid, appUuid)}`;
        const app = `data app "${name}"${slug === null ? '' : ` (slug: ${slug})`}`;
        const readyPhrase =
            version === 1
                ? `The ${app} is ready.`
                : `Version ${version} of the ${app} is ready.`;
        const readyBuild = {
            status: 'success' as const,
            appUuid,
            version,
            name,
            slug,
            href,
        };
        return {
            result: `${readyPhrase} The user can view it from this thread.`,
            metadata: readyBuild,
            structuredContent: { status: 'success', version, name },
        };
    }
    const cancelled = error === APP_VERSION_CANCELLED_BY_USER;
    const message = cancelled
        ? 'The build was cancelled.'
        : (statusMessage ?? 'The build failed.');
    const result = `The data app build did not finish: ${message}`;
    return {
        result,
        metadata: {
            status: 'error',
            appUuid,
            reason: cancelled ? 'cancelled' : 'failed',
            message,
        },
        structuredContent: { error: result },
    };
};

export const getExpiredGenerateDataAppBuildOutcome = (
    appUuid: string,
): ToolGenerateDataAppTerminalResult => {
    const message = `The build did not report an outcome within ${
        AI_DATA_APP_BUILD_PENDING_GRACE_MS / 60_000
    } minutes.`;
    const result = `The data app build did not finish: ${message}`;
    return {
        result,
        metadata: { status: 'error', appUuid, reason: 'failed', message },
        structuredContent: { error: result },
    };
};
