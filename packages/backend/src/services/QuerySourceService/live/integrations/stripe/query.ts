import {
    ApiConnectorType,
    SupportedDbtAdapter,
    WeekDay,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { ALL_PUSHDOWN_REFUSED, type LiveQuery } from '../../sdk';
import { STRIPE_MAX_QUERY_ROWS, STRIPE_PAGE_ROWS, toStripeError } from './api';
import { compileStripeQuery } from './compile';
import {
    STRIPE_DATE_FILTERS,
    STRIPE_FILTERS_BY_TYPE,
    STRIPE_METRIC_FILTERS,
} from './model';
import {
    parseStripeQuery,
    runStripeQuery,
    STRIPE_CALLS_PER_QUERY,
} from './run';

// Stripe's Queries API runs Trino SQL, whose weeks start on Monday
const STRIPE_SQL_BUILDER = warehouseSqlBuilderFromType(
    SupportedDbtAdapter.TRINO,
    WeekDay.MONDAY,
);

export const stripeQuery: LiveQuery<ApiConnectorType.STRIPE, string> = {
    request: parseStripeQuery,
    compile: ({ explore, metricQuery }) =>
        compileStripeQuery({
            explore,
            metricQuery,
            warehouseSqlBuilder: STRIPE_SQL_BUILDER,
        }),
    run: runStripeQuery,
    toError: (response) => toStripeError(response),
    // SQL, so filters take any shape and dates are ordinary filters.
    // Timestamps are UTC.
    capabilities: {
        filters: {
            operators: {
                ...STRIPE_FILTERS_BY_TYPE,
                metric: STRIPE_METRIC_FILTERS,
            },
            multipleValues: true,
            or: true,
            nestedGroups: true,
        },
        metricFilters: true,
        dates: {
            rangeRequired: false,
            operators: STRIPE_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
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
        timeoutMs: 30_000,
        maxRows: STRIPE_MAX_QUERY_ROWS,
        pageSize: STRIPE_PAGE_ROWS,
        callsPerQuery: STRIPE_CALLS_PER_QUERY,
        // Stripe starts 10 query runs a second and runs 100 at once in live
        // mode (1 and 10 in sandboxes), within 100 calls a second
        // account-wide.
        concurrentCalls: 5,
        callsPerSecond: 10,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 600,
            },
        ],
        note: 'Query runs are async: one call starts a run, then calls check it until it finishes. Sandboxes start one run a second.',
    },
    warehouseSqlBuilder: STRIPE_SQL_BUILDER,
};
