import { ApiConnectorType, ParameterError } from '@lightdash/common';
import { z } from 'zod';
import { getIsoDateInTimeZone } from '../apiDateRange';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    assertApiSourceOrigin,
    type ApiSourceIntegration,
} from '../ApiSourceIntegration';
import { compileLinkedInAdsQuery } from './linkedinAdsCompiler';
import {
    getLinkedInAdsAccountPath,
    LINKEDIN_ADS_ANALYTICS_PATH,
    LINKEDIN_ADS_CAPABILITIES,
    LINKEDIN_ADS_ORIGIN,
    LINKEDIN_ADS_REQUEST_HEADERS,
    LINKEDIN_ADS_TIMEOUT_MS,
    LINKEDIN_ADS_TOKEN_URL,
    LinkedInAdsConnector,
} from './LinkedInAdsConnector';
import {
    LINKEDIN_ADS_PERFORMANCE_EXPLORE,
    LINKEDIN_ADS_SEMANTIC_LAYER_VERSION,
} from './linkedinAdsSemanticLayer';

const LINKEDIN_AD_ACCOUNT_ID = /^\d{1,20}$/;
const LABEL = 'LinkedIn Ads';
// LinkedIn reports in UTC, whatever the project's time zone.
const LINKEDIN_ADS_TIME_ZONE = 'UTC';

export const linkedInAdsIntegration: ApiSourceIntegration<ApiConnectorType.LINKEDIN_ADS> =
    {
        connector: ApiConnectorType.LINKEDIN_ADS,
        settingsSchema: z.object({
            connector: z.literal(ApiConnectorType.LINKEDIN_ADS),
            adAccountId: z.string(),
        }),
        baseLayer: {
            baseVersion: LINKEDIN_ADS_SEMANTIC_LAYER_VERSION,
            capabilities: LINKEDIN_ADS_CAPABILITIES,
            definitions: [LINKEDIN_ADS_PERFORMANCE_EXPLORE],
            // organic_shares needs another API, permission and account, so it
            // may become its own integration; the name stays reserved here.
            plannedModelNames: [
                'creatives',
                'demographics',
                'conversions',
                'organic_shares',
            ],
        },
        getAccessRules: ({ adAccountId }) => ({
            allowedPathPrefixes: [
                LINKEDIN_ADS_ANALYTICS_PATH,
                getLinkedInAdsAccountPath(adAccountId),
            ],
            allowedMethods: ['GET'],
            allowedContentTypes: ['application/json'],
            timeoutMs: LINKEDIN_ADS_TIMEOUT_MS,
            responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
            customHeaders: LINKEDIN_ADS_REQUEST_HEADERS,
        }),
        validateConnection: ({ apiSource, type, origin, oauthTokenUrl }) => {
            if (!LINKEDIN_AD_ACCOUNT_ID.test(apiSource.adAccountId)) {
                throw new ParameterError(
                    'The LinkedIn ad account ID must be a number',
                );
            }
            assertApiSourceOrigin(LABEL, origin, LINKEDIN_ADS_ORIGIN);
            if (
                type !== 'oauth_authorization_code' ||
                oauthTokenUrl !== LINKEDIN_ADS_TOKEN_URL
            ) {
                throw new ParameterError(
                    'LinkedIn Ads connections authenticate by signing in with LinkedIn',
                );
            }
        },
        createConnector: ({ adAccountId }, send) => ({
            connector: new LinkedInAdsConnector({ adAccountId, send }),
        }),
        compile: ({ explore, metricQuery, now }) =>
            compileLinkedInAdsQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, LINKEDIN_ADS_TIME_ZONE),
            }),
    };
