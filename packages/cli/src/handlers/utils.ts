import {
    assertUnreachable,
    AuthTokenPrefix,
    LightdashCliVersionHeader,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
import {
    refuseAgentConnection,
    requireInvocationContext,
    type Credential,
} from '../credentials';
import { CLI_VERSION } from '../env';

enum TokenType {
    ApiKey = 'ApiKey',
    Bearer = 'Bearer',
}

type RequestHeader = {
    'Content-Type': 'application/json';
    'Content-Encoding'?: string;
    Authorization: string;
    'Proxy-Authorization'?: string;
    [LightdashRequestMethodHeader]: RequestMethod;
    [LightdashCliVersionHeader]: string;
};

export function getCredentialAuthHeader(credential: Credential): string {
    requireInvocationContext();
    switch (credential.kind) {
        case 'human_api_key':
            return `${TokenType.ApiKey} ${credential.token}`;
        case 'service_account':
        case 'agent_connection':
            return `${TokenType.Bearer} ${credential.token}`;
        default:
            return assertUnreachable(credential, 'Unknown credential kind');
    }
}

/**
 * We initially used personal access tokens (PATs) for CLI authentication without any prefix.
 * Service account tokens are launching with a prefix, so we'll check them first.
 * We assume a missing prefix is a personal access token, although new PATs will be created with a prefix.
 *
 * See {@link AuthTokenPrefix} for the available token prefixes
 */
export function getAuthHeader(token: string) {
    refuseAgentConnection();
    const authType = token?.startsWith(AuthTokenPrefix.SERVICE_ACCOUNT)
        ? TokenType.Bearer
        : TokenType.ApiKey;
    return `${authType} ${token}`;
}

function buildHeaders(authorization: string) {
    const headers: RequestHeader = {
        'Content-Type': 'application/json',
        Authorization: authorization,
        [LightdashRequestMethodHeader]:
            process.env.CI === 'true'
                ? RequestMethod.CLI_CI
                : RequestMethod.CLI,
        [LightdashCliVersionHeader]: CLI_VERSION,
    };

    if (process.env.LIGHTDASH_PROXY_AUTHORIZATION) {
        headers['Proxy-Authorization'] =
            process.env.LIGHTDASH_PROXY_AUTHORIZATION;
    }

    return headers;
}

export function buildRequestHeaders(token: string) {
    const headers: RequestHeader = {
        'Content-Type': 'application/json',
        Authorization: getAuthHeader(token),
        [LightdashRequestMethodHeader]:
            process.env.CI === 'true'
                ? RequestMethod.CLI_CI
                : RequestMethod.CLI,
        [LightdashCliVersionHeader]: CLI_VERSION,
    };

    if (process.env.LIGHTDASH_PROXY_AUTHORIZATION) {
        headers['Proxy-Authorization'] =
            process.env.LIGHTDASH_PROXY_AUTHORIZATION;
    }

    return headers;
}

export function buildCredentialHeaders(
    credential: Credential,
    proxyAuthorization: string | null,
): RequestHeader {
    const headers = {
        ...buildHeaders(getCredentialAuthHeader(credential)),
    };
    if (credential.kind === 'agent_connection' && proxyAuthorization !== null)
        headers['Proxy-Authorization'] = proxyAuthorization;
    return headers;
}
