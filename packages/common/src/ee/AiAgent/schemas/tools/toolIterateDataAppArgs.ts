import { z } from 'zod';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';
import {
    DATA_APP_BRIEF_AUDIENCE,
    DATA_APP_BRIEF_QUERY_GUIDANCE,
    DATA_APP_CONNECTION_LINKING,
    DATA_APP_THEME_SLUG_SOURCE,
    dataAppBuildWarningsSchema,
    externalConnectionSlugsInput,
    isToolGenerateDataAppResult,
    MCP_DATA_APP_AGENT_SCOPE_GUIDANCE,
    toolGenerateDataAppOutputSchema,
    type ToolGenerateDataAppOutput,
} from './toolGenerateDataAppArgs';

export const TOOL_ITERATE_DATA_APP_DESCRIPTION =
    'Start a background build that adds a version to an existing data app from a brief describing the change. While a version of the app is already building, this call and every retry fail until that build ends: tell the user to wait for it to finish.';

export const MCP_TOOL_ITERATE_DATA_APP_DESCRIPTION = `Tool: iterate_data_app

Purpose:
Start a build that adds a version to an existing data app from a brief describing the change. The app's name and slug stay as they are. Use generate_data_app for a brand-new app, and iterate_custom_chart_type, if available, for a custom chart type.

Important:
- The build runs in the background for several minutes, and this call returns once it starts. Call it once per request, then poll get_data_app_build_status with the same appSlug until the build ends.
- While a version of the app is already building, this call fails. Poll get_data_app_build_status until that build ends, then call this tool again.
${MCP_DATA_APP_AGENT_SCOPE_GUIDANCE}
`;

export const toolIterateDataAppArgsSchema = z.object({
    appSlug: z
        .string()
        .describe(
            'Slug of the app to change: from an earlier build result, findContent or readContent (find_content, read_content over MCP).',
        ),
    prompt: z
        .string()
        .describe(
            `Self-contained brief of the change for the coding agent, which works from the app's current source. ${DATA_APP_BRIEF_AUDIENCE} Describe what to change and the outcome to expect, leaving out what stays the same; for a failed build, name what went wrong. ${DATA_APP_BRIEF_QUERY_GUIDANCE}`,
        ),
    dashboardSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            "Existing dashboard to pull in: its slug, from findContent (find_content over MCP). The coding agent gets the dashboard's layout and charts; the dashboard stays unchanged.",
        ),
    chartSlugs: z
        .array(z.string())
        .nullish()
        .default(null)
        .describe(
            'Saved charts whose queries the change builds on: slugs from findContent (find_content over MCP). The charts stay unchanged.',
        ),
    themeSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            `${DATA_APP_THEME_SLUG_SOURCE} Passing it switches the app's theme, so pass it only when the user asks to switch the theme in this request; omit it to keep the current one.`,
        ),
    externalConnectionSlugs: externalConnectionSlugsInput.describe(
        `External connections to add to the app before the build: slugs from listDataAppConnections (list_data_app_connections over MCP). Connections the app already links stay. ${DATA_APP_CONNECTION_LINKING} Omit when the change needs no new outside API.`,
    ),
});

export const toolIterateDataAppStructuredContentSchema = z.object({
    status: z
        .literal('pending')
        .describe(
            'The build has started and runs in the background; its outcome lands on this result later.',
        ),
    // Optional: pending results persisted before warnings existed lack it.
    warnings: dataAppBuildWarningsSchema.optional(),
});

// The iterate tool shares the create tool's outcome contract: same pending,
// success, and error metadata, patched by the same build outcome recording.
// Built by hand because that metadata is a discriminated union, which
// structuredToolOutputSchema does not accept.
export const toolIterateDataAppOutputSchema = z.object({
    result: z.string(),
    metadata: toolGenerateDataAppOutputSchema.shape.metadata,
    structuredContent: z.union([
        toolIterateDataAppStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolIterateDataAppArgs = z.infer<
    typeof toolIterateDataAppArgsSchema
>;

export type ToolIterateDataAppStructuredContent = z.infer<
    typeof toolIterateDataAppStructuredContentSchema
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
