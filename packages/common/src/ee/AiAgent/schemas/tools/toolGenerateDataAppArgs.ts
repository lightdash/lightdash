import { z } from 'zod';
import {
    APP_VERSION_CANCELLED_BY_USER,
    isAppVersionInProgress,
    type AppVersionStatus,
} from '../../../apps/types';

/** Builds run minutes, not seconds: a pending result older than this is stale. */
export const AI_DATA_APP_BUILD_PENDING_GRACE_MS = 30 * 60 * 1000;

export const DATA_APP_BUILD_TEMPLATES = [
    'dashboard',
    'slideshow',
    'pdf',
    'custom',
] as const;
export type DataAppBuildTemplate = (typeof DATA_APP_BUILD_TEMPLATES)[number];

export const TOOL_GENERATE_DATA_APP_DESCRIPTION = [
    "Start building a data app — an interactive application generated from a prompt on top of this project's semantic layer.",
    'Use it ONLY when the user asks to build, make, or generate a data app (or an app, slide show, or PDF report). Do NOT use it for questions, charts, dashboards, or other saved content.',
    'The build runs in the background for several minutes, so the call returns as soon as it has started (status: "pending"). Tell the user the build has started and that you will be able to link them to the app afterwards, then end your turn. Never wait, poll, or call this tool again for the same request: one request, one call.',
    'A later turn sees the outcome on this call\'s result: "success" carries the app name and the builder link (href) to share; "error" carries the failure message.',
].join(' ');

export const toolGenerateDataAppArgsSchema = z.object({
    prompt: z
        .string()
        .describe(
            'A self-contained brief for the coding agent that builds the app: what the app shows, for whom, and how it should behave. Fold in what this thread found — for each visualization the app should include, add a line like `[viz name][metric query]` with the explore, metrics, dimensions, filters and sort. The coding agent sees the semantic layer but not this conversation, so include every detail it needs.',
        ),
    template: z
        .enum(DATA_APP_BUILD_TEMPLATES)
        .nullable()
        .describe(
            'Starting template: "dashboard" for a dashboard-style app, "slideshow" for a slide show, "pdf" for a PDF report, "custom" (or null) for anything else.',
        ),
    dashboardSlug: z
        .string()
        .nullable()
        .describe(
            "Generate from an existing dashboard: its slug (from findContent). The app starts from the dashboard's layout and charts. Null when not generating from a dashboard.",
        ),
    chartSlugs: z
        .array(z.string())
        .nullable()
        .describe(
            'Saved charts (slugs from findContent) whose queries the app should be built on. Null when not building on saved charts.',
        ),
});

export const toolGenerateDataAppOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('pending'),
            appUuid: z.string(),
            version: z.number(),
        }),
        z.object({
            status: z.literal('success'),
            appUuid: z.string(),
            version: z.number(),
            name: z.string(),
            href: z.string(),
        }),
        z.object({
            status: z.literal('error'),
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

type ToolGenerateDataAppResultLike = {
    toolType: string;
    toolName: string;
    metadata:
        | ToolGenerateDataAppOutput['metadata']
        | Record<string, unknown>
        | null;
};

type ToolGenerateDataAppResult = ToolGenerateDataAppResultLike & {
    toolType: 'built-in';
    toolName: 'generateDataApp';
    metadata: ToolGenerateDataAppOutput['metadata'];
};

export const isToolGenerateDataAppResult = <
    T extends ToolGenerateDataAppResultLike,
>(
    result: T,
): result is T & ToolGenerateDataAppResult =>
    result.toolType === 'built-in' &&
    result.toolName === 'generateDataApp' &&
    toolGenerateDataAppOutputSchema.shape.metadata.safeParse(result.metadata)
        .success;

export const getDataAppBuilderPath = (projectUuid: string, appUuid: string) =>
    `/projects/${projectUuid}/apps/${appUuid}`;

// Terminal tool result for a version, or null while still building. Shared by
// the worker patch and the thread-read self-heal.
export const getGenerateDataAppBuildOutcome = ({
    projectUuid,
    appUuid,
    version,
    name,
    status,
    error,
    statusMessage,
}: {
    projectUuid: string;
    appUuid: string;
    version: number;
    name: string;
    status: AppVersionStatus;
    error: string | null;
    statusMessage: string | null;
}): ToolGenerateDataAppTerminalResult | null => {
    if (isAppVersionInProgress(status)) {
        return null;
    }
    if (status === 'ready') {
        const href = getDataAppBuilderPath(projectUuid, appUuid);
        return {
            result: `The data app "${name}" is ready. Share this link so the user can open it in the builder: ${href}`,
            metadata: { status: 'success', appUuid, version, name, href },
        };
    }
    const message =
        error === APP_VERSION_CANCELLED_BY_USER
            ? 'The build was cancelled.'
            : (statusMessage ?? 'The build failed.');
    return {
        result: `The data app build did not finish: ${message}`,
        metadata: { status: 'error', message },
    };
};

export const getExpiredGenerateDataAppBuildOutcome =
    (): ToolGenerateDataAppTerminalResult => {
        const message = `The build did not report an outcome within ${
            AI_DATA_APP_BUILD_PENDING_GRACE_MS / 60_000
        } minutes.`;
        return {
            result: `The data app build did not finish: ${message}`,
            metadata: { status: 'error', message },
        };
    };
