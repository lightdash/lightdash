import { ParameterError, type ApiCreateAiMcpServer } from '@lightdash/common';

export type AiMcpOAuthClientCredentials = {
    clientId: string;
    clientSecret?: string;
};

// Shared by the service and the model. A client ID may stand alone (public
// client, PKCE only); a secret without a client ID is rejected.
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
