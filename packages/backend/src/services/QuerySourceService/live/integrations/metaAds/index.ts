import {
    ApiConnectorType,
    getMetaAdsInsightsPath,
    LIVE_INTEGRATION_CATALOG,
    META_ADS_ORIGIN,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    getIsoDateInTimeZone,
    readRule,
} from '../../sdk';
import { compileMetaAdsQuery } from './compile';
import { toMetaAdsError } from './errors';
import { META_ADS_EXPLORES } from './explores';
import { META_ADS_DATE_FILTERS, META_ADS_NAME_FILTERS } from './filters';
import {
    META_ADS_CALLS_PER_QUERY,
    META_ADS_MAX_QUERY_ROWS,
    META_ADS_PAGE_SIZE,
    metaAdsRequestSchema,
    runMetaAdsQuery,
} from './run';
import { summarizeMetaAdsTest } from './testSummary';
import { metaAdsUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.META_ADS];
const LABEL = CATALOG.messageLabel;
const META_ADS_ACCOUNT_ID = /^\d{1,20}$/;

export const metaAdsIntegration = defineLiveIntegration({
    connector: ApiConnectorType.META_ADS,
    label: LABEL,
    kind: 'reports',
    connection: {
        settings: CATALOG.settings,
        origins: [META_ADS_ORIGIN],
        access: ({ adAccountId }) => ({
            rules: [readRule('GET', getMetaAdsInsightsPath(adAccountId))],
        }),
        checkAuth: ({ type }) => {
            if (type !== 'bearer_token') {
                throw new ParameterError(
                    'Meta Ads connections authenticate with a system user access token',
                );
            }
        },
        validate: ({ adAccountId }) => {
            if (!META_ADS_ACCOUNT_ID.test(adAccountId)) {
                throw new ParameterError(
                    'The Meta ad account ID must be a number, without the act_ prefix',
                );
            }
        },
        describeTarget: ({ settings: { adAccountId } }) =>
            `Meta Ads account ${adAccountId}`,
        summarizeTest: summarizeMetaAdsTest,
    },
    model: {
        explores: META_ADS_EXPLORES,
        plannedNames: ['demographics', 'placements', 'creatives'],
    },
    query: {
        request: metaAdsRequestSchema,
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
        limits: {
            callsPerQuery: META_ADS_CALLS_PER_QUERY,
            timeoutMs: 60_000,
            maxRows: META_ADS_MAX_QUERY_ROWS,
            pageSize: META_ADS_PAGE_SIZE,
            // Meta counts load per app and ad account and publishes no fixed number,
            // so these stay well below what its best-practices page warns about.
            concurrentCalls: 3,
            callsPerSecond: null,
            buckets: [
                {
                    id: 'minute',
                    label: 'per minute',
                    windowMs: 60_000,
                    capacity: 60,
                },
                {
                    id: 'hour',
                    label: 'per hour',
                    windowMs: 3_600_000,
                    capacity: 1_000,
                },
            ],
            note: 'Meta scores load per app and ad account and publishes no fixed number.',
        },
    },
    spec: {
        auth: {
            description:
                'Needs Meta business verification and App Review for ads_read.',
            testWith: 'paid_account',
            needs: ['gmail', 'phone', 'card', 'real_person'],
            token: true,
            oauth: 'needs_review',
        },
        useCases: metaAdsUseCases,
    },
});
