import {
    ApiConnectorType,
    getMetaAdsInsightsPath,
    META_ADS_ORIGIN,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import { getIsoDateInTimeZone } from '../apiDateRange';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    assertApiSourceOrigin,
    type ApiSourceIntegration,
} from '../ApiSourceIntegration';
import { compileMetaAdsQuery } from './metaAdsCompiler';
import {
    META_ADS_CAPABILITIES,
    META_ADS_MAX_QUERY_ROWS,
    META_ADS_TIMEOUT_MS,
    MetaAdsConnector,
} from './MetaAdsConnector';
import {
    META_ADS_INSIGHTS_EXPLORE,
    META_ADS_SEMANTIC_LAYER_VERSION,
} from './metaAdsSemanticLayer';

const META_ADS_ACCOUNT_ID = /^\d{1,20}$/;

export const metaAdsIntegration: ApiSourceIntegration<ApiConnectorType.META_ADS> =
    {
        connector: ApiConnectorType.META_ADS,
        settingsSchema: z.object({
            connector: z.literal(ApiConnectorType.META_ADS),
            adAccountId: z.string(),
        }),
        baseLayer: {
            baseVersion: META_ADS_SEMANTIC_LAYER_VERSION,
            capabilities: META_ADS_CAPABILITIES,
            definitions: [META_ADS_INSIGHTS_EXPLORE],
            plannedModelNames: ['demographics', 'placements', 'creatives'],
        },
        getAccessRules: ({ adAccountId }) => ({
            allowedPathPrefixes: [getMetaAdsInsightsPath(adAccountId)],
            allowedMethods: ['GET'],
            allowedContentTypes: ['application/json'],
            timeoutMs: META_ADS_TIMEOUT_MS,
            responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
        }),
        validateConnection: ({ apiSource, type, origin }) => {
            if (!META_ADS_ACCOUNT_ID.test(apiSource.adAccountId)) {
                throw new ParameterError(
                    'The Meta ad account ID must be a number, without the act_ prefix',
                );
            }
            assertApiSourceOrigin('Meta Ads', origin, META_ADS_ORIGIN);
            if (type !== 'bearer_token') {
                throw new ParameterError(
                    'Meta Ads connections authenticate with a system user access token',
                );
            }
        },
        createConnector: ({ adAccountId }, send) => ({
            connector: new MetaAdsConnector({ adAccountId, send }),
        }),
        compile: ({ explore, metricQuery, timezone, now }) =>
            compileMetaAdsQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, timezone),
                maxRows: META_ADS_MAX_QUERY_ROWS,
            }),
    };
