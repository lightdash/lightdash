import { z } from 'zod';

export const MCP_TOOL_LIST_DATA_APP_CONNECTIONS_DESCRIPTION = `Tool: list_data_app_connections

Purpose:
List the project's external connections you can link to a data app. An external connection is an admin-configured, credentialed proxy to an outside API (product analytics, billing, CRM, ...); a data app can call an API only through a linked connection.

Important:
- Call it when the user wants a data app to use an outside API or names a connection, then pass the matching slugs as externalConnectionSlugs to generate_data_app or iterate_data_app.
- Only connections you may link are listed. Credentials are never returned.
- Pass appSlug to also see which connections that app already links.

Parameters:
- appSlug: Optional. A data app's slug; fills linkedAliases for that app.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<the connections, one per line>" }]
- structuredContent: {
    connections: [{
      slug:          string,        // pass in externalConnectionSlugs
      name:          string,
      authType:      string,        // "none" | "api_key" | "bearer_token" | "google_service_account" | "oauth_client_credentials"
      origin:        string,        // the API's base URL
      instructions:  string | null, // how to use the API, written by an admin
      linkedAliases: string[]       // aliases the appSlug app links it under; empty when not linked or no appSlug
    }]
  }

Errors: an unknown appSlug, or an app this caller may not view, returns an error.
`;

export const mcpListDataAppConnectionsArgsSchema = z.object({
    appSlug: z
        .string()
        .min(1)
        .nullish()
        .default(null)
        .describe(
            "A data app's slug. Pass it to see which connections that app already links; omit to list connections only.",
        ),
});

export type McpListDataAppConnectionsArgs = z.infer<
    typeof mcpListDataAppConnectionsArgsSchema
>;

export const mcpListDataAppConnectionsStructuredOutputSchema = z.object({
    connections: z
        .array(
            z.object({
                slug: z
                    .string()
                    .describe(
                        'Pass in externalConnectionSlugs to generate_data_app or iterate_data_app.',
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
