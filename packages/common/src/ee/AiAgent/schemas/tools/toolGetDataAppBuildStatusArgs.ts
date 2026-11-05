import { z } from 'zod';
import {
    APP_VERSION_CANCELLED_BY_USER,
    APP_VERSION_STAGE_ORDER,
    getAppDisplayName,
    type AppVersionStatus,
} from '../../../apps/types';
import {
    DATA_APP_BUILD_POLL_INTERVAL_MS,
    getDataAppBuilderPath,
} from './toolGenerateDataAppArgs';

// The pipeline has no 'cancelled' status — it is an 'error' row carrying
// APP_VERSION_CANCELLED_BY_USER — so the tool reports it as its own value.
export const DATA_APP_BUILD_STATUSES = [
    ...APP_VERSION_STAGE_ORDER,
    'error',
    'cancelled',
] as const;

export type DataAppBuildStatus = (typeof DATA_APP_BUILD_STATUSES)[number];

const STAGE_STATUS_MESSAGES = {
    pending: 'The build is queued.',
    sandbox: 'Preparing the build sandbox.',
    catalog: 'Reading the project semantic layer.',
    compact: 'Catching up on earlier work.',
    generating: 'Writing the app.',
    building: 'Building the app.',
    packaging: 'Packaging the app.',
    ready: 'The app is ready.',
} as const satisfies Record<(typeof APP_VERSION_STAGE_ORDER)[number], string>;

export const MCP_TOOL_GET_DATA_APP_BUILD_STATUS_DESCRIPTION = `Tool: get_data_app_build_status

Purpose:
Check how a data app or custom chart type build is going, and get its URL once it is ready.

Important:
- Poll every ${
    DATA_APP_BUILD_POLL_INTERVAL_MS / 1000
} seconds, as "nextPollAfterMs" in the response says; a build usually takes several minutes.
- Stop polling once "status" is "ready", "error" or "cancelled": the version never changes again.
- Keep using the slug the build started with: it never changes, even when the app is renamed.
- An agent-scoped session restricted to specific spaces cannot read a personal app, which is what a build started over MCP creates. Call this tool without agentUuid to poll a build you started.
`;

export const mcpGetDataAppBuildStatusArgsSchema = z.object({
    appSlug: z
        .string()
        .min(1)
        .describe(
            "The data app's or custom chart type's slug, as returned when the build started.",
        ),
    version: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Which version of the app to report on. Omit for the latest version — the one a build you just started produces.',
        ),
});

export type McpGetDataAppBuildStatusArgs = z.infer<
    typeof mcpGetDataAppBuildStatusArgsSchema
>;

export const mcpGetDataAppBuildStatusStructuredOutputSchema = z.object({
    status: z
        .enum(DATA_APP_BUILD_STATUSES)
        .describe(
            'Pipeline stage the build has reached, or a terminal outcome: "ready", "error", or "cancelled".',
        ),
    statusMessage: z
        .string()
        .describe(
            'Short line describing what the build is doing, or how it ended.',
        ),
    errorMessage: z
        .string()
        .nullable()
        .describe('Why the build failed. Set only when status is "error".'),
    name: z.string().describe("The app's name."),
    slug: z.string().describe("The app's permanent slug; it never changes."),
    href: z
        .string()
        .describe(
            'URL that opens the app, or Chart Studio for a custom chart type.',
        ),
    nextPollAfterMs: z
        .number()
        .int()
        .positive()
        .describe(
            'How long to wait before polling again. Stop polling on a terminal status.',
        ),
});

export type DataAppBuildStatusResponse = z.infer<
    typeof mcpGetDataAppBuildStatusStructuredOutputSchema
>;

/** Version row -> the status a caller polls for. */
export const getDataAppBuildStatusResponse = ({
    siteUrl,
    projectUuid,
    appUuid,
    version,
    name,
    slug,
    status,
    error,
    statusMessage,
    isCustomChartType,
}: {
    siteUrl: string;
    projectUuid: string;
    appUuid: string;
    version: number;
    name: string;
    slug: string;
    status: AppVersionStatus;
    error: string | null;
    statusMessage: string | null;
    isCustomChartType: boolean;
}): DataAppBuildStatusResponse => {
    const displayName = getAppDisplayName(name, appUuid);
    const kind = isCustomChartType ? 'chart type' : 'data app';
    const common = {
        name: displayName,
        slug,
        href: isCustomChartType
            ? `${siteUrl}/projects/${projectUuid}/chart-studio/${slug}`
            : `${siteUrl}${getDataAppBuilderPath(projectUuid, slug)}`,
        nextPollAfterMs: DATA_APP_BUILD_POLL_INTERVAL_MS,
    };
    if (status !== 'error') {
        return {
            ...common,
            status,
            statusMessage:
                status === 'ready'
                    ? `${
                          version === 1
                              ? `The ${kind} "${displayName}"`
                              : `Version ${version} of the ${kind} "${displayName}"`
                      } is ready.`
                    : (statusMessage ?? STAGE_STATUS_MESSAGES[status]),
            errorMessage: null,
        };
    }
    if (error === APP_VERSION_CANCELLED_BY_USER) {
        return {
            ...common,
            status: 'cancelled',
            statusMessage: 'The build was cancelled.',
            errorMessage: null,
        };
    }
    const failure = error ?? statusMessage ?? 'The build failed.';
    return {
        ...common,
        status: 'error',
        statusMessage: statusMessage ?? 'The build failed.',
        errorMessage: failure,
    };
};
