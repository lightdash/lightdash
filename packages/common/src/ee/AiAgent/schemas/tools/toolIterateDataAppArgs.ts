import { z } from 'zod';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';
import {
    DATA_APP_BUILD_POLL_INTERVAL_MS,
    DATA_APP_THEME_SLUG_DESCRIPTION,
    isToolGenerateDataAppResult,
    MCP_DATA_APP_AGENT_SCOPE_GUIDANCE,
    toolGenerateDataAppOutputSchema,
    type ToolGenerateDataAppOutput,
} from './toolGenerateDataAppArgs';

export const TOOL_ITERATE_DATA_APP_DESCRIPTION = [
    'Start a build that adds a version to an existing data app from a follow-up brief.',
    'Use it when the user wants to change, fix, or extend a data app that already exists — one built earlier in this thread, or one found with findContent; use generateDataApp only for a brand-new app.',
    "The coding agent works from the app's current source, so the brief should describe the change, not restate the whole app.",
    'The build runs in the background for several minutes, so the call returns as soon as it has started (status: "pending") and the outcome lands on this result for a later turn. One request, one call — never wait, poll, or call this tool again for the same request: tell the user the build has started and end your turn.',
    'While a version is already building for the app, the call fails — relay that the user should wait for the current build to finish.',
    'When the attached context lists element references for this app (bracketed `[tag "text" @path:line]` strings), copy every one of them verbatim into the brief — the coding agent resolves them by source location and cannot see them otherwise.',
].join(' ');

export const MCP_TOOL_ITERATE_DATA_APP_DESCRIPTION = `Tool: iterate_data_app

Purpose:
Start a build that adds a version to an existing data app from a follow-up brief. Use it to change, fix, or extend an app that already exists; generate_data_app is the tool for a brand-new app.

Important:
- The coding agent works from the app's current source, so the brief describes the change rather than restating the whole app.
- The app's name and slug stay as they are. The build adds a version to the app named by appSlug.
- The build runs in the background for several minutes. This call returns as soon as the build has started. Poll get_data_app_build_status with the same appSlug every ${
    DATA_APP_BUILD_POLL_INTERVAL_MS / 1000
} seconds until its status is "ready", "error", or "cancelled". Call this tool once per request.
- While a version is already building for the app, this call fails with "A version is already building for this app". Poll get_data_app_build_status until that build reaches a terminal status, then call this tool again.
${MCP_DATA_APP_AGENT_SCOPE_GUIDANCE}
- Pass themeSlug only when the user asks to switch the app's theme; omitting it keeps the current one. An unknown themeSlug fails before the build starts and lists the valid slugs, which list_data_app_themes also returns.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<confirmation that the build started>" }]
- structuredContent: {
    slug:    string, // the app's slug, unchanged by this build
    version: number  // the version of the app this build produces
  }

Errors: an unknown appSlug, themeSlug, dashboardSlug, or chartSlug returns an error and starts no build.
`;

export const toolIterateDataAppArgsSchema = z.object({
    appSlug: z
        .string()
        .describe(
            'Slug of the data app to change — from an earlier generateDataApp or iterateDataApp result, findContent, or readContent.',
        ),
    prompt: z
        .string()
        .describe(
            "A self-contained brief of the change for the coding agent, which works from the app's current source and explores the semantic layer itself, but sees neither this conversation nor its query results. Describe what to change and the outcome you expect; carry over any analysis this thread already settled as queries — a number pasted into the brief gets hardcoded into the app.",
        ),
    dashboardSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            "Pull in an existing dashboard: its slug (from findContent). The coding agent gets the dashboard's layout and charts as context; the dashboard itself stays unchanged. Omit when the change does not reference a dashboard.",
        ),
    chartSlugs: z
        .array(z.string())
        .nullish()
        .default(null)
        .describe(
            'Saved charts (slugs from findContent) whose queries the change builds on; the charts themselves stay unchanged. Omit when the change does not reference saved charts.',
        ),
    themeSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            `${DATA_APP_THEME_SLUG_DESCRIPTION} On an existing app, passing it switches the app's theme; omit it unless the user asked to switch the theme in this request, so the app keeps its current theme.`,
        ),
});

// The iterate tool shares the create tool's outcome contract: same pending,
// success, and error shapes, patched by the same build outcome recording.
export const toolIterateDataAppOutputSchema = toolGenerateDataAppOutputSchema;

export type ToolIterateDataAppArgs = z.infer<
    typeof toolIterateDataAppArgsSchema
>;

export type ToolIterateDataAppOutput = z.infer<
    typeof toolIterateDataAppOutputSchema
>;

export const isToolIterateDataAppResult = makeBuiltInToolResultGuard(
    'iterateDataApp',
    toolGenerateDataAppOutputSchema.shape.metadata,
);

/** A data app build result from either the create or the iterate tool. */
export const isToolDataAppBuildResult = <
    T extends { toolType: string; toolName: string; metadata: unknown },
>(
    result: T,
): result is T & {
    toolType: 'built-in';
    toolName: 'generateDataApp' | 'iterateDataApp';
    metadata: ToolGenerateDataAppOutput['metadata'];
} => isToolGenerateDataAppResult(result) || isToolIterateDataAppResult(result);
