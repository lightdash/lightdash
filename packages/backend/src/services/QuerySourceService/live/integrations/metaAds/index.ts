import {
    ApiConnectorType,
    getMetaAdsInsightsPath,
    META_ADS_ORIGIN,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import { ALL_PUSHDOWN_REFUSED } from '../../connector';
import {
    defineLiveIntegration,
    jsonRequest,
} from '../../defineLiveIntegration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileMetaAdsQuery } from './compile';
import { toMetaAdsError } from './errors';
import {
    META_ADS_DATE_FILTERS,
    META_ADS_INSIGHTS_EXPLORE,
    META_ADS_NAME_FILTERS,
} from './explores';
import {
    META_ADS_CALLS_PER_QUERY,
    META_ADS_MAX_QUERY_ROWS,
    metaAdsRequestSchema,
    runMetaAdsQuery,
} from './run';

const LABEL = 'Meta Ads';
const META_ADS_ACCOUNT_ID = /^\d{1,20}$/;

export const metaAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.META_ADS,
    label: LABEL,
    settings: z.object({
        connector: z.literal(ApiConnectorType.META_ADS),
        adAccountId: z.string(),
    }),
    origins: [META_ADS_ORIGIN],
    access: ({ adAccountId }) => ({
        pathPrefixes: [getMetaAdsInsightsPath(adAccountId)],
        methods: ['GET'],
    }),
    // Meta counts load per app and ad account and publishes no fixed number,
    // so these stay well below what its best-practices page warns about.
    limits: {
        concurrentCalls: 3,
        callsPerMinute: 60,
        callsPerHour: 1_000,
        callsPerQuery: META_ADS_CALLS_PER_QUERY,
        timeoutMs: 60_000,
        maxRows: META_ADS_MAX_QUERY_ROWS,
    },
    // Insights ANDs one flat list of filters on ad objects and reads one date
    // range in the ad account's time zone. Everything else is refused.
    capabilities: {
        filters: {
            operators: {
                string: META_ADS_NAME_FILTERS,
                date: META_ADS_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: META_ADS_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [META_ADS_INSIGHTS_EXPLORE],
    plannedModelNames: ['demographics', 'placements', 'creatives'],
    validate: ({ adAccountId }) => {
        if (!META_ADS_ACCOUNT_ID.test(adAccountId)) {
            throw new ParameterError(
                'The Meta ad account ID must be a number, without the act_ prefix',
            );
        }
    },
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Meta Ads connections authenticate with a system user access token',
            );
        }
    },
    describeTarget: ({ settings: { adAccountId } }) =>
        `Meta Ads account ${adAccountId}`,
    parseRequest: jsonRequest(LABEL, metaAdsRequestSchema),
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileMetaAdsQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
            maxRows: META_ADS_MAX_QUERY_ROWS,
        }),
    run: runMetaAdsQuery,
    toError: (response, { adAccountId }) =>
        toMetaAdsError(response, adAccountId),
});
