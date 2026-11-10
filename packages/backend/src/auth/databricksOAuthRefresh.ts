import {
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
} from '@lightdash/warehouses';
import { type Agent } from 'node:http';
import {
    createOAuthDeadlineAgent,
    OAUTH_REQUEST_TIMEOUT_CODE,
    OAUTH_REQUEST_TIMEOUT_MS,
    OAuthRequestTimeoutError,
} from './oauthRequestDeadline';

const withDatabricksOAuthDeadline = async <T>(
    host: string,
    timeoutMs: number,
    exchange: (agent: Agent) => Promise<T>,
): Promise<T> => {
    const agent = createOAuthDeadlineAgent(
        `https://${host}/oidc/v1/token`,
        timeoutMs,
    );
    try {
        return await exchange(agent);
    } catch (error) {
        if (
            !(error instanceof OAuthRequestTimeoutError) &&
            error instanceof Error &&
            'code' in error &&
            error.code === OAUTH_REQUEST_TIMEOUT_CODE
        ) {
            throw new OAuthRequestTimeoutError();
        }
        throw error;
    } finally {
        agent.destroy();
    }
};

export const exchangeDatabricksOAuthCredentialsWithDeadline = (
    host: string,
    clientId: string,
    clientSecret: string,
    timeoutMs = OAUTH_REQUEST_TIMEOUT_MS,
): ReturnType<typeof exchangeDatabricksOAuthCredentials> =>
    withDatabricksOAuthDeadline(host, timeoutMs, (agent) =>
        exchangeDatabricksOAuthCredentials(host, clientId, clientSecret, {
            agent,
        }),
    );

export const refreshDatabricksOAuthTokenWithDeadline = (
    host: string,
    clientId: string,
    refreshToken: string,
    clientSecret?: string,
    timeoutMs = OAUTH_REQUEST_TIMEOUT_MS,
): ReturnType<typeof refreshDatabricksOAuthToken> =>
    withDatabricksOAuthDeadline(host, timeoutMs, (agent) =>
        refreshDatabricksOAuthToken(
            host,
            clientId,
            refreshToken,
            clientSecret,
            {
                agent,
            },
        ),
    );
