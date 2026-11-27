import { ApiConnectorType } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { SENTRY_RETENTION_DAYS, toSentryError } from './api';
import { compileSentryQuery } from './compile';
import {
    SENTRY_BOOLEAN_FILTERS,
    SENTRY_DATE_FILTERS,
    SENTRY_TEXT_FILTERS,
    SENTRY_VALUE_FILTERS,
} from './model';
import {
    runSentryQuery,
    SENTRY_CALLS_PER_QUERY,
    SENTRY_MAX_QUERY_ROWS,
    SENTRY_PAGE_SIZE,
    sentryRequestSchema,
    type SentryRequest,
} from './run';

export const sentryQuery: LiveQuery<ApiConnectorType.SENTRY, SentryRequest> = {
    request: sentryRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compileSentryQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runSentryQuery,
    toError: (response, settings) => toSentryError(response, settings),
    // One AND of search terms, each taking a list of values. Errors and
    // sessions are read over one range of UTC days.
    capabilities: {
        filters: {
            operators: {
                string: [...SENTRY_VALUE_FILTERS, ...SENTRY_TEXT_FILTERS],
                boolean: SENTRY_BOOLEAN_FILTERS,
                date: SENTRY_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: SENTRY_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
            maxLookbackDays: SENTRY_RETENTION_DAYS,
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        // Sessions by project are read one project a call, so a query can
        // take more calls than its pages
        callsPerQuery: SENTRY_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: SENTRY_MAX_QUERY_ROWS,
        pageSize: SENTRY_PAGE_SIZE,
        concurrentCalls: 3,
        callsPerSecond: 5,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 100,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 2_000,
            },
        ],
        note: 'Sentry publishes no numbers. It limits each endpoint for each caller and reports the limit in X-Sentry-Rate-Limit headers. These limits are low on purpose.',
    },
};
