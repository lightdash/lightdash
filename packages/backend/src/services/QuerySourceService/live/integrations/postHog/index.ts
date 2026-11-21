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
import { ALL_PUSHDOWN_REFUSED, defineLiveIntegration } from '../../integration';
import { compilePostHogQuery } from './compile';
import {
    isInternalPostHogProperty,
    POSTHOG_DATE_FILTERS,
    POSTHOG_EVENTS_EXPLORE,
    POSTHOG_FILTERS_BY_TYPE,
    POSTHOG_METRIC_FILTERS,
    withPostHogPropertyFields,
} from './explores';
import {
    getPostHogOAuthEndpoints,
    getPostHogPropertyDefinitionsPrefix,
    getPostHogQueryPath,
    parsePostHogQuery,
    POSTHOG_MAX_QUERY_ROWS,
    runPostHogQuery,
    scanPostHogProperties,
    toPostHogError,
} from './run';
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
        pathPrefixes: [
            getPostHogQueryPath(projectId),
            getPostHogPropertyDefinitionsPrefix(projectId),
        ],
        // GET reads the property definitions the semantic layer scans
        methods: ['POST', 'GET'],
    }),
    // PostHog's query API limits per PostHog project: 3 at once, 240 a
    // minute, 2,400 an hour.
    limits: {
        concurrentCalls: 3,
        callsPerMinute: 240,
        callsPerHour: 2_400,
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
    explores: [POSTHOG_EVENTS_EXPLORE],
    plannedModelNames: ['persons', 'sessions'],
    level: { value: 5, description: 'Yes. HogQL is SQL.' },
    auth: {
        description:
            'Offers a token and OAuth sign-in. No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'no_review',
    },
    paging: { description: 'One HogQL query returns up to 50,000 rows.' },
    rateLimiting: {
        description:
            'Query API per project: 3 at once, 240 a minute, 2,400 an hour.',
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
    scan: {
        read: scanPostHogProperties,
        withScannedFields: (definition, scan) =>
            scan.posthogProperties
                ? withPostHogPropertyFields(definition, scan.posthogProperties)
                : definition,
        isInternalField: isInternalPostHogProperty,
    },
    warehouseSqlBuilder: POSTHOG_SQL_BUILDER,
});
