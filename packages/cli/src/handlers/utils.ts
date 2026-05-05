import {
    AuthTokenPrefix,
    LightdashCliVersionHeader,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
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

/**
 * We initially used personal access tokens (PATs) for CLI authentication without any prefix.
 * Service account tokens are launching with a prefix, so we'll check them first.
 * We assume a missing prefix is a personal access token, although new PATs will be created with a prefix.
 *
 * See {@link AuthTokenPrefix} for the available token prefixes
 */
function getAuthHeader(token: string) {
    const authType = token?.startsWith(AuthTokenPrefix.SERVICE_ACCOUNT)
        ? TokenType.Bearer
        : TokenType.ApiKey;
    return `${authType} ${token}`;
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
