import {
    ApiConnectorType,
    ParameterError,
    POSTHOG_REGION_ORIGINS,
    SupportedDbtAdapter,
    WeekDay,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { z } from 'zod';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    type ApiSourceIntegration,
} from '../ApiSourceIntegration';
import { compilePostHogQuery } from './posthogCompiler';
import {
    getPostHogOAuthEndpoints,
    getPostHogPropertyDefinitionsPrefix,
    getPostHogQueryPath,
    POSTHOG_CAPABILITIES,
    PostHogConnector,
} from './PostHogConnector';
import {
    isInternalPostHogProperty,
    POSTHOG_EVENTS_EXPLORE,
    POSTHOG_SEMANTIC_LAYER_VERSION,
    withPostHogPropertyFields,
} from './posthogSemanticLayer';

const POSTHOG_PROJECT_ID = /^\d{1,12}$/;
// PostHog can queue a query for 30s before running it for up to 10s.
const POSTHOG_TIMEOUT_MS = 45_000;
// PostHog weeks start on Monday, like its week field, not on ClickHouse's
// default Sunday
const POSTHOG_SQL_BUILDER = warehouseSqlBuilderFromType(
    SupportedDbtAdapter.CLICKHOUSE,
    WeekDay.MONDAY,
);

export const postHogIntegration: ApiSourceIntegration<ApiConnectorType.POSTHOG> =
    {
        connector: ApiConnectorType.POSTHOG,
        settingsSchema: z.object({
            connector: z.literal(ApiConnectorType.POSTHOG),
            projectId: z.string(),
        }),
        baseLayer: {
            baseVersion: POSTHOG_SEMANTIC_LAYER_VERSION,
            capabilities: POSTHOG_CAPABILITIES,
            definitions: [POSTHOG_EVENTS_EXPLORE],
            plannedModelNames: ['persons', 'sessions'],
        },
        warehouseSqlBuilder: POSTHOG_SQL_BUILDER,
        getAccessRules: ({ projectId }) => ({
            allowedPathPrefixes: [
                getPostHogQueryPath(projectId),
                getPostHogPropertyDefinitionsPrefix(projectId),
            ],
            // GET reads the property definitions the semantic layer scans
            allowedMethods: ['POST', 'GET'],
            allowedContentTypes: ['application/json'],
            timeoutMs: POSTHOG_TIMEOUT_MS,
            responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
        }),
        validateConnection: ({ apiSource, type, origin, oauthTokenUrl }) => {
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
        },
        createConnector: ({ projectId }, send) => {
            const connector = new PostHogConnector({ projectId, send });
            return {
                connector,
                scan: async () => {
                    const [event, person] = await Promise.all([
                        connector.getPropertyDefinitions('event'),
                        connector.getPropertyDefinitions('person'),
                    ]);
                    return { posthogProperties: { event, person } };
                },
            };
        },
        compile: ({ explore, metricQuery, timezone }) =>
            compilePostHogQuery({
                explore,
                metricQuery,
                warehouseSqlBuilder: POSTHOG_SQL_BUILDER,
                timezone,
            }),
        withScannedFields: (definition, scan) =>
            scan.posthogProperties
                ? withPostHogPropertyFields(definition, scan.posthogProperties)
                : definition,
        isInternalField: isInternalPostHogProperty,
    };
