import { z } from 'zod';
import {
    APP_VERSION_CANCELLED_BY_USER,
    isAppVersionInProgress,
    type AppVersionStatus,
    type DataAppTemplate,
} from '../../../apps/types';
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

/** How a prior visualization's query travels in the brief; shared with the system prompt. */
export const DATA_APP_VIZ_LINE_FORMAT =
    '[viz title][explore; metrics; dimensions; filters; sort]';

/** Shared by generateDataApp and iterateDataApp; the iterate tool adds its own theme-change caveat in its description. */
export const DATA_APP_THEME_SLUG_DESCRIPTION =
    'Organization theme to build the app with: its slug, from the attached context ("Theme: <name> (slug: <slug>)"). Omit when no theme is given — the organization default applies. An unknown slug returns an error listing the valid slugs and starts no build.';

export const TOOL_GENERATE_DATA_APP_DESCRIPTION = [
    "Start building a new data app — an interactive application generated from a brief on top of this project's semantic layer.",
    'Use it when the user asks to build, make, or generate a data app (or an app, slide show, or PDF report); questions, charts, dashboards, and other saved content have their own tools.',
    'This tool always creates a new app: to change an app that already exists, use iterateDataApp instead.',
    'Name the app yourself: the name fixes both the app name and its slug at creation, and neither changes afterwards.',
    'The build runs in the background for several minutes, so the call returns as soon as it has started (status: "pending") and the outcome lands on this result for a later turn. One request, one call — never wait, poll, or call this tool again for the same request: tell the user the build has started and end your turn.',
].join(' ');

/** Placement every MCP-started build shares; stated on each start tool. */
export const MCP_DATA_APP_PLACEMENT_GUIDANCE = [
    "- The app is created as the calling user's personal app: at the project root, in no space, visible only to them until they move it.",
    '- An agent-scoped session restricted to specific spaces cannot read a personal app. Call this tool and get_data_app_build_status without agentUuid to build and poll an app you own.',
].join('\n');

export const MCP_TOOL_GENERATE_DATA_APP_DESCRIPTION = `Tool: generate_data_app

Purpose:
Start building a new data app: an interactive application generated from a brief on top of a Lightdash project's semantic layer. Each build produces one version of the app. Charts, dashboards, and other saved content have their own tools.

Important:
- You name the app. The name fixes both the app's name and its slug at creation, and neither changes afterwards. A name already taken in the project gets a numeric suffix on the slug, so identify the app by the slug this call returns, never one you derived from the name.
- The build runs in the background for several minutes. This call returns as soon as the build has started. Poll get_data_app_build_status with the returned slug every 15 seconds until its status is "ready", "error", or "cancelled". Call this tool once per request.
${MCP_DATA_APP_PLACEMENT_GUIDANCE}
- An unknown themeSlug fails before the build starts and lists the valid slugs. Call list_data_app_themes when the user names a theme, brand, or look.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<confirmation that the build started>" }]
- structuredContent: {
    slug:    string, // the app's permanent slug; pass it to get_data_app_build_status
    version: number  // the version of the app this build produces
  }

Errors: an unknown themeSlug, dashboardSlug, or chartSlug returns an error and starts no build.
`;

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
});

export type McpDataAppBuildStarted = z.infer<
    typeof mcpDataAppBuildStartedOutputSchema
>;

export const toolGenerateDataAppArgsSchema = z.object({
    name: z
        .string()
        .describe(
            'Display name for the app: a headline-short title, in title case, naming what the app shows ("Revenue Overview"). The app\'s slug is derived from it at creation, so treat the name as final — it is not renamed later.',
        ),
    prompt: z
        .string()
        .describe(
            `A self-contained brief for the coding agent that builds the app: what the app shows, for whom, and how it behaves. The coding agent explores the semantic layer itself but sees neither this conversation nor its query results: when this thread has already settled the analysis, carry it over — for each visualization, its title, a one-line description, and a metric query line \`${DATA_APP_VIZ_LINE_FORMAT}\` — as queries, never pasted numbers, which would be hardcoded into the app.`,
        ),
    template: z
        .enum(DATA_APP_BUILD_TEMPLATES)
        .nullish()
        .default(null)
        .describe(
            'Starter template the builder would use: "dashboard" for a dashboard-style app, "slideshow" for a slide show, "pdf" for a PDF report, "custom" for anything else. Omit when the user did not ask for one.',
        ),
    dashboardSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            "Generate from an existing dashboard: its slug (from findContent). The app starts from the dashboard's layout and charts; the dashboard itself stays unchanged. Omit when not generating from a dashboard.",
        ),
    chartSlugs: z
        .array(z.string())
        .nullish()
        .default(null)
        .describe(
            'Saved charts (slugs from findContent) whose queries the app is built on; the charts themselves stay unchanged. Omit when not building on saved charts.',
        ),
    themeSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(DATA_APP_THEME_SLUG_DESCRIPTION),
});

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
});

export type ToolGenerateDataAppArgs = z.infer<
    typeof toolGenerateDataAppArgsSchema
>;

export type ToolGenerateDataAppOutput = z.infer<
    typeof toolGenerateDataAppOutputSchema
>;

export type ToolGenerateDataAppTerminalResult = {
    result: string;
    metadata: Exclude<
        ToolGenerateDataAppOutput['metadata'],
        { status: 'pending' }
    >;
};

export const isToolGenerateDataAppResult = makeBuiltInToolResultGuard(
    'generateDataApp',
    toolGenerateDataAppOutputSchema.shape.metadata,
);

export const getDataAppBuilderPath = (projectUuid: string, appUuid: string) =>
    `/projects/${projectUuid}/apps/${appUuid}`;

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
        const readyPhrase =
            version === 1
                ? `The data app "${name}" is ready.`
                : `Version ${version} of the data app "${name}" is ready.`;
        return {
            result: `${readyPhrase} The user can view it from this thread.`,
            metadata: { status: 'success', appUuid, version, name, slug, href },
        };
    }
    const cancelled = error === APP_VERSION_CANCELLED_BY_USER;
    const message = cancelled
        ? 'The build was cancelled.'
        : (statusMessage ?? 'The build failed.');
    return {
        result: `The data app build did not finish: ${message}`,
        metadata: {
            status: 'error',
            appUuid,
            reason: cancelled ? 'cancelled' : 'failed',
            message,
        },
    };
};

export const getExpiredGenerateDataAppBuildOutcome = (
    appUuid: string,
): ToolGenerateDataAppTerminalResult => {
    const message = `The build did not report an outcome within ${
        AI_DATA_APP_BUILD_PENDING_GRACE_MS / 60_000
    } minutes.`;
    return {
        result: `The data app build did not finish: ${message}`,
        metadata: { status: 'error', appUuid, reason: 'failed', message },
    };
};
