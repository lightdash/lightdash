import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

const CONNECTION_DEFINITION =
    'admin-configured, credentialed proxies to outside APIs (product analytics, billing, CRM)';

// MCP has no system prompt, so its description keeps the build policy the agent prompt owns.
const MCP_CONNECTION_MATCH_GUIDANCE =
    'Call it when the user wants a data app to use an outside API or names a connection; match the request to a connection by name, slug or origin and pass its slug in externalConnectionSlugs. When none matches, tell the user no such connection is available rather than starting a build that cannot reach it.';

export const TOOL_LIST_DATA_APP_CONNECTIONS_DESCRIPTION = `List the project's external connections a data app can link: ${CONNECTION_DEFINITION}.`;

export const MCP_TOOL_LIST_DATA_APP_CONNECTIONS_DESCRIPTION = `Tool: list_data_app_connections

Purpose:
List the project's external connections you may link to a data app: ${CONNECTION_DEFINITION}.

Important:
- ${MCP_CONNECTION_MATCH_GUIDANCE}
`;

export const toolListDataAppConnectionsArgsSchema = z.object({
    appSlug: z
        .string()
        .min(1)
        .nullish()
        .default(null)
        .describe(
            "A data app's slug. Pass it to see which connections that app already links; omit to list connections only.",
        ),
});

export type ToolListDataAppConnectionsArgs = z.infer<
    typeof toolListDataAppConnectionsArgsSchema
>;

export const mcpListDataAppConnectionsStructuredOutputSchema = z.object({
    connections: z
        .array(
            z.object({
                slug: z
                    .string()
                    .describe(
                        'Pass in externalConnectionSlugs when starting a data app build.',
                    ),
                name: z.string().describe("The connection's display name."),
                authType: z
                    .string()
                    .describe('How the proxy authenticates to the API.'),
                origin: z.string().describe("The API's base URL."),
                instructions: z
                    .string()
                    .nullable()
                    .describe('How to use the API, written by an admin.'),
                linkedAliases: z
                    .array(z.string())
                    .describe(
                        'Aliases the appSlug app links this connection under; empty when not linked or no appSlug was given.',
                    ),
            }),
        )
        .describe('Connections you may link; empty when there are none.'),
});

export type McpListDataAppConnectionsOutput = z.infer<
    typeof mcpListDataAppConnectionsStructuredOutputSchema
>;

export const toolListDataAppConnectionsOutputSchema =
    structuredToolOutputSchema({
        metadata: baseOutputMetadataSchema,
        structuredContent: mcpListDataAppConnectionsStructuredOutputSchema,
    });

export type ToolListDataAppConnectionsStructuredContent =
    McpListDataAppConnectionsOutput;

export type ToolListDataAppConnectionsOutput = z.infer<
    typeof toolListDataAppConnectionsOutputSchema
>;
