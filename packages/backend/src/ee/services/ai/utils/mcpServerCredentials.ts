import { ParameterError, type ApiCreateAiMcpServer } from '@lightdash/common';

export type AiMcpOAuthClientCredentials = {
    clientId: string;
    clientSecret?: string;
};

/**
 * The one rule for the OAuth client credentials of an agent MCP server, shared
 * by the service (request validation and normalisation) and the model (payload
 * serialisation). A client ID may stand alone: that is a public client, and
 * the MCP SDK then authenticates the token request with PKCE only. A secret
 * without a client ID is rejected.
 */
export const normalizeAiMcpOAuthClientCredentials = (
    credentials: ApiCreateAiMcpServer['credentials'] | undefined,
): AiMcpOAuthClientCredentials | null => {
    const clientId = credentials?.clientId?.trim() || undefined;
    const clientSecret = credentials?.clientSecret?.trim() || undefined;

    if (!clientId) {
        if (clientSecret) {
            throw new ParameterError(
                'OAuth client secret requires a client ID',
            );
        }
        return null;
    }

    return clientSecret ? { clientId, clientSecret } : { clientId };
};
