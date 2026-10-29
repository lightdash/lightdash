import {
    ApiConnectorType,
    assertUnreachable,
    ParameterError,
    POSTHOG_REGION_ORIGINS,
    type CreateExternalConnection,
    type ExternalConnectionApiSource,
    type ExternalConnectionAuthType,
} from '@lightdash/common';
import {
    SEARCH_CONSOLE_ORIGIN,
    SEARCH_CONSOLE_SITES_PATH,
} from '../../../services/QuerySourceService/api/google/SearchConsoleConnector';
import { getPostHogQueryPath } from '../../../services/QuerySourceService/api/posthog/PostHogConnector';
import { GOOGLE_TOKEN_URL } from './googleOAuth';
import { getPostHogOAuthEndpoints } from './postHogOAuth';

const POSTHOG_PROJECT_ID = /^\d{1,12}$/;
// PostHog can queue a query for 30s before running it for up to 10s.
const POSTHOG_TIMEOUT_MS = 45_000;
const SEARCH_CONSOLE_TIMEOUT_MS = 30_000;
const SEARCH_CONSOLE_SITE =
    /^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s/?#]+\/[^\s?#]*)$/i;
const API_SOURCE_RESPONSE_MAX_BYTES = 25 * 1024 * 1024;

type ApiSourceAccessRules = Required<
    Pick<
        CreateExternalConnection,
        | 'allowedPathPrefixes'
        | 'allowedMethods'
        | 'allowedContentTypes'
        | 'timeoutMs'
        | 'responseMaxBytes'
    >
>;

const getAccessRules = (
    apiSource: ExternalConnectionApiSource,
): ApiSourceAccessRules => {
    switch (apiSource.connector) {
        case ApiConnectorType.POSTHOG:
            return {
                allowedPathPrefixes: [getPostHogQueryPath(apiSource.projectId)],
                allowedMethods: ['POST'],
                allowedContentTypes: ['application/json'],
                timeoutMs: POSTHOG_TIMEOUT_MS,
                responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
            };
        // The token already limits the source to sites the account can read.
        case ApiConnectorType.SEARCH_CONSOLE:
            return {
                allowedPathPrefixes: [SEARCH_CONSOLE_SITES_PATH],
                allowedMethods: ['POST'],
                allowedContentTypes: ['application/json'],
                timeoutMs: SEARCH_CONSOLE_TIMEOUT_MS,
                responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
            };
        default:
            return assertUnreachable(apiSource, 'Unknown api connector');
    }
};

/** Api source connections reach only the query endpoint, whatever access rules the request carries. */
export const withApiSourceAccessRules = <
    T extends { apiSource?: ExternalConnectionApiSource | null },
>(
    config: T,
): T =>
    config.apiSource
        ? { ...config, ...getAccessRules(config.apiSource) }
        : config;

export const validateApiSourceConnection = ({
    apiSource,
    type,
    origin,
    oauthTokenUrl,
}: {
    apiSource?: ExternalConnectionApiSource | null;
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
}): void => {
    if (!apiSource) {
        if (type === 'oauth_authorization_code') {
            throw new ParameterError(
                'Only live data sources can sign in with OAuth',
            );
        }
        return;
    }
    switch (apiSource.connector) {
        case ApiConnectorType.POSTHOG: {
            if (!POSTHOG_PROJECT_ID.test(apiSource.projectId)) {
                throw new ParameterError(
                    'The PostHog project ID must be a number',
                );
            }
            const regionOrigins: string[] = Object.values(
                POSTHOG_REGION_ORIGINS,
            );
            if (!regionOrigins.includes(origin.replace(/\/+$/, ''))) {
                throw new ParameterError(
                    `PostHog connections must use ${regionOrigins.join(' or ')}`,
                );
            }
            if (type === 'oauth_authorization_code') {
                if (
                    oauthTokenUrl !== getPostHogOAuthEndpoints(origin).tokenUrl
                ) {
                    throw new ParameterError(
                        "PostHog sign-in must use the region's token endpoint",
                    );
                }
                return;
            }
            if (type !== 'bearer_token') {
                throw new ParameterError(
                    'PostHog connections authenticate with a personal API key or by signing in to PostHog',
                );
            }
            return;
        }
        case ApiConnectorType.SEARCH_CONSOLE: {
            if (!SEARCH_CONSOLE_SITE.test(apiSource.siteUrl)) {
                throw new ParameterError(
                    'The Search Console site must look like https://example.com/ or sc-domain:example.com',
                );
            }
            if (origin.replace(/\/+$/, '') !== SEARCH_CONSOLE_ORIGIN) {
                throw new ParameterError(
                    `Search Console connections must use ${SEARCH_CONSOLE_ORIGIN}`,
                );
            }
            if (
                type !== 'oauth_authorization_code' ||
                oauthTokenUrl !== GOOGLE_TOKEN_URL
            ) {
                throw new ParameterError(
                    'Search Console connections authenticate by signing in with Google',
                );
            }
            return;
        }
        default:
            assertUnreachable(apiSource, 'Unknown api connector');
    }
};
