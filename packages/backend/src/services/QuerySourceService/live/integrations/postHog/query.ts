import {
    ApiConnectorType,
    SupportedDbtAdapter,
    WeekDay,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { ALL_PUSHDOWN_REFUSED, type LiveQuery } from '../../sdk';
import { toPostHogError } from './api';
import { compilePostHogQuery } from './compile';
import {
    POSTHOG_DATE_FILTERS,
    POSTHOG_FILTERS_BY_TYPE,
    POSTHOG_METRIC_FILTERS,
} from './model';
import {
    parsePostHogQuery,
    POSTHOG_MAX_QUERY_ROWS,
    runPostHogQuery,
} from './run';

// PostHog weeks start on Monday, like its week field, not on ClickHouse's
// default Sunday
const POSTHOG_SQL_BUILDER = warehouseSqlBuilderFromType(
    SupportedDbtAdapter.CLICKHOUSE,
    WeekDay.MONDAY,
);

export const postHogQuery: LiveQuery<ApiConnectorType.POSTHOG, string> = {
    request: parsePostHogQuery,
    compile: ({ explore, metricQuery, timezone }) =>
        compilePostHogQuery({
            explore,
            metricQuery,
            warehouseSqlBuilder: POSTHOG_SQL_BUILDER,
            timezone,
        }),
    run: runPostHogQuery,
    toError: toPostHogError,
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
    limits: {
        // PostHog can queue a query for 30s before running it for up to 10s.
        timeoutMs: 45_000,
        maxRows: POSTHOG_MAX_QUERY_ROWS,
        // PostHog's query API limits per PostHog project: 3 at once, 240 a
        // minute, 2,400 an hour.
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
    warehouseSqlBuilder: POSTHOG_SQL_BUILDER,
};
