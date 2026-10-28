import {
    ApiConnectorType,
    assertUnreachable,
    ParameterError,
    POSTHOG_REGION_ORIGINS,
    type CreateExternalConnection,
    type ExternalConnectionApiSource,
    type ExternalConnectionAuthType,
} from '@lightdash/common';
import { getPostHogQueryPath } from '../../../services/QuerySourceService/api/posthog/PostHogConnector';

const POSTHOG_PROJECT_ID = /^\d{1,12}$/;
// PostHog can queue a query for 30s before running it for up to 10s.
const POSTHOG_TIMEOUT_MS = 45_000;
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
        default:
            return assertUnreachable(
                apiSource.connector,
                `Unknown api connector: ${apiSource.connector}`,
            );
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
}: {
    apiSource?: ExternalConnectionApiSource | null;
    type: ExternalConnectionAuthType;
    origin: string;
}): void => {
    if (!apiSource) return;
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
            if (type !== 'bearer_token') {
                throw new ParameterError(
                    'PostHog connections authenticate with a personal API key sent as a bearer token',
                );
            }
            return;
        }
        default:
            assertUnreachable(
                apiSource.connector,
                `Unknown api connector: ${apiSource.connector}`,
            );
    }
};
