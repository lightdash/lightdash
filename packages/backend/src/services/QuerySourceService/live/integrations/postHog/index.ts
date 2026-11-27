import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    POSTHOG_REGION_ORIGINS,
    SupportedDbtAdapter,
    WeekDay,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { z } from 'zod';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    describeExplores,
    readRule,
} from '../../sdk';
import { compilePostHogQuery } from './compile';
import { POSTHOG_EXPLORES } from './explores';
import {
    POSTHOG_DATE_FILTERS,
    POSTHOG_FILTERS_BY_TYPE,
    POSTHOG_METRIC_FILTERS,
} from './filters';
import {
    getPostHogOAuthEndpoints,
    getPostHogPropertyDefinitionsPrefix,
    getPostHogQueryPath,
    parsePostHogQuery,
    POSTHOG_MAX_QUERY_ROWS,
    runPostHogQuery,
    scanPostHogProperties,
    toPostHogError,
    type PostHogCatalog,
} from './run';
import {
    isInternalPostHogProperty,
    withPostHogPropertyFields,
} from './scanFields';
import { summarizePostHogTest } from './testSummary';
import { postHogUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.POSTHOG];
const LABEL = CATALOG.messageLabel;
const POSTHOG_PROJECT_ID = /^\d{1,12}$/;
// PostHog weeks start on Monday, like its week field, not on ClickHouse's
// default Sunday
const POSTHOG_SQL_BUILDER = warehouseSqlBuilderFromType(
    SupportedDbtAdapter.CLICKHOUSE,
    WeekDay.MONDAY,
);

export const postHogIntegration = defineLiveIntegration({
    connector: ApiConnectorType.POSTHOG,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [POSTHOG_REGION_ORIGINS.us, POSTHOG_REGION_ORIGINS.eu],
    access: ({ projectId }) => ({
        rules: [
            readRule('POST', getPostHogQueryPath(projectId)),
            readRule('GET', getPostHogPropertyDefinitionsPrefix(projectId)),
        ],
    }),
    limits: {
        callsPerQuery: 1,
        // PostHog can queue a query for 30s before running it for up to 10s.
        timeoutMs: 45_000,
        maxRows: POSTHOG_MAX_QUERY_ROWS,
    },
    // HogQL is SQL, so filters take any shape and dates are ordinary
    // filters. Table calculations, custom fields and period over period
    // compile into the query through the warehouse SQL builder; the rest
    // stays refused until that is built.
    capabilities: {
        filters: {
            operators: {
                ...POSTHOG_FILTERS_BY_TYPE,
                metric: POSTHOG_METRIC_FILTERS,
            },
            multipleValues: true,
            or: true,
            nestedGroups: true,
        },
        metricFilters: true,
        dates: {
            rangeRequired: false,
            operators: POSTHOG_DATE_FILTERS,
            grains: [],
            timezone: 'configurable',
        },
        pushdown: {
            ...ALL_PUSHDOWN_REFUSED,
            tableCalculations: 'native',
            customDimensions: 'native',
            customMetrics: 'native',
            periodOverPeriod: 'native',
        },
    },
    explores: POSTHOG_EXPLORES,
    plannedModelNames: ['persons', 'sessions'],
    level: {
        value: 5,
        description: 'HogQL is SQL, so PostHog totals everything itself.',
    },
    kind: 'sql',
    auth: {
        description: 'No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'no_review',
    },
    paging: {
        description:
            '100 rows by default; up to 50,000 rows per query with an explicit LIMIT.',
    },
    // PostHog's query API limits per PostHog project: 3 at once, 240 a
    // minute, 2,400 an hour.
    rateLimits: {
        concurrentCalls: 3,
        callsPerSecond: null,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 240,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 2_400,
            },
        ],
    },
    useCases: postHogUseCases,
    validate: ({ projectId }) => {
        if (!POSTHOG_PROJECT_ID.test(projectId)) {
            throw new ParameterError('The PostHog project ID must be a number');
        }
    },
    checkAuth: ({ type, origin, oauthTokenUrl }) => {
        if (type === 'oauth_authorization_code') {
            if (oauthTokenUrl !== getPostHogOAuthEndpoints(origin).tokenUrl) {
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
    describeTarget: ({ settings: { projectId }, origin, targetLabel }) => {
        const region = Object.entries(POSTHOG_REGION_ORIGINS).find(
            ([, regionOrigin]) => regionOrigin === origin,
        )?.[0];
        const project = targetLabel
            ? `"${targetLabel}" (ID ${projectId})`
            : projectId;
        return `PostHog project ${project}${region ? `, ${region.toUpperCase()} region` : ''}`;
    },
    parseRequest: parsePostHogQuery,
    compile: ({ explore, metricQuery, timezone }) =>
        compilePostHogQuery({
            explore,
            metricQuery,
            warehouseSqlBuilder: POSTHOG_SQL_BUILDER,
            timezone,
        }),
    run: runPostHogQuery,
    toError: toPostHogError,
    summarizeTest: summarizePostHogTest,
    discovery: {
        discover: scanPostHogProperties,
        describe: describeExplores(
            POSTHOG_EXPLORES,
            [],
            (definition, catalog: PostHogCatalog) =>
                catalog.posthogProperties
                    ? withPostHogPropertyFields(
                          definition,
                          catalog.posthogProperties,
                      )
                    : definition,
        ),
        isInternalField: isInternalPostHogProperty,
    },
    warehouseSqlBuilder: POSTHOG_SQL_BUILDER,
});
