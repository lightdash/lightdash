import { ApiConnectorType, ParameterError } from '@lightdash/common';
import { z } from 'zod';
import { getIsoDateInTimeZone } from '../apiDateRange';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    assertApiSourceOrigin,
    type ApiSourceIntegration,
} from '../ApiSourceIntegration';
import { compileGoogleAdsQuery } from './googleAdsCompiler';
import {
    getGoogleAdsSearchPath,
    GOOGLE_ADS_CAPABILITIES,
    GOOGLE_ADS_ORIGIN,
    GOOGLE_ADS_TIMEOUT_MS,
    GoogleAdsConnector,
} from './GoogleAdsConnector';
import {
    GOOGLE_ADS_PERFORMANCE_EXPLORE,
    GOOGLE_ADS_SEMANTIC_LAYER_VERSION,
} from './googleAdsSemanticLayer';
import { assertGoogleSignIn } from './googleSignIn';

const GOOGLE_ADS_CUSTOMER_ID = /^\d{10}$/;
const LABEL = 'Google Ads';

export const googleAdsIntegration: ApiSourceIntegration<ApiConnectorType.GOOGLE_ADS> =
    {
        connector: ApiConnectorType.GOOGLE_ADS,
        settingsSchema: z.object({
            connector: z.literal(ApiConnectorType.GOOGLE_ADS),
            customerId: z.string(),
            loginCustomerId: z.string().nullable(),
        }),
        describeTarget: ({ apiSource: { customerId }, targetLabel }) =>
            targetLabel
                ? `Google Ads account "${targetLabel}" (ID ${customerId})`
                : `Google Ads account ${customerId}`,
        baseLayer: {
            baseVersion: GOOGLE_ADS_SEMANTIC_LAYER_VERSION,
            capabilities: GOOGLE_ADS_CAPABILITIES,
            definitions: [GOOGLE_ADS_PERFORMANCE_EXPLORE],
            plannedModelNames: [
                'ads',
                'keywords',
                'search_terms',
                'conversions',
                'locations',
            ],
        },
        // Google's only Ads scope also allows changes, so the source reaches
        // nothing but the read-only report endpoint of its one account.
        getAccessRules: ({ customerId, loginCustomerId }) => ({
            allowedPathPrefixes: [getGoogleAdsSearchPath(customerId)],
            allowedMethods: ['POST'],
            allowedContentTypes: ['application/json'],
            timeoutMs: GOOGLE_ADS_TIMEOUT_MS,
            responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
            customHeaders: loginCustomerId
                ? { 'login-customer-id': loginCustomerId }
                : null,
        }),
        validateConnection: ({ apiSource, type, origin, oauthTokenUrl }) => {
            if (
                !GOOGLE_ADS_CUSTOMER_ID.test(apiSource.customerId) ||
                (apiSource.loginCustomerId !== null &&
                    !GOOGLE_ADS_CUSTOMER_ID.test(apiSource.loginCustomerId))
            ) {
                throw new ParameterError(
                    'Google Ads customer IDs must be 10 digits without dashes',
                );
            }
            assertApiSourceOrigin(LABEL, origin, GOOGLE_ADS_ORIGIN);
            assertGoogleSignIn(LABEL, { type, oauthTokenUrl });
        },
        createConnector: ({ customerId }, send) => ({
            connector: new GoogleAdsConnector({ customerId, send }),
        }),
        compile: ({ explore, metricQuery, timezone, now }) =>
            compileGoogleAdsQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, timezone),
            }),
    };
