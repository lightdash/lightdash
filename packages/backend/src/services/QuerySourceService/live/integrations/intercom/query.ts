import { ApiConnectorType } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { toIntercomError } from './api';
import { compileIntercomQuery } from './compile';
import {
    INTERCOM_BOOLEAN_FILTERS,
    INTERCOM_DATE_FILTERS,
    INTERCOM_NUMBER_FILTERS,
    INTERCOM_TEXT_FILTERS,
    INTERCOM_VALUE_FILTERS,
} from './model';
import {
    INTERCOM_CALLS_PER_QUERY,
    INTERCOM_MAX_QUERY_ROWS,
    INTERCOM_PAGE_SIZE,
    intercomRequestSchema,
    runIntercomQuery,
    type IntercomRequest,
} from './run';

export const intercomQuery: LiveQuery<
    ApiConnectorType.INTERCOM,
    IntercomRequest
> = {
    request: intercomRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compileIntercomQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runIntercomQuery,
    toError: (response) => toIntercomError(response),
    // One AND of search filters; "is" takes a list of values. Conversations
    // and tickets are searched by a range of creation days; dates are UTC days.
    capabilities: {
        filters: {
            operators: {
                string: [...INTERCOM_VALUE_FILTERS, ...INTERCOM_TEXT_FILTERS],
                number: INTERCOM_NUMBER_FILTERS,
                boolean: INTERCOM_BOOLEAN_FILTERS,
                date: INTERCOM_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: INTERCOM_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        callsPerQuery: INTERCOM_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: INTERCOM_MAX_QUERY_ROWS,
        pageSize: INTERCOM_PAGE_SIZE,
        concurrentCalls: 5,
        callsPerSecond: 10,
        buckets: [
            {
                id: 'ten_seconds',
                label: 'per 10 seconds',
                windowMs: 10_000,
                capacity: 300,
            },
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 1_800,
            },
        ],
        note: 'Intercom allows 10,000 calls a minute in 10-second windows, shared by every private app in the workspace, and 25,000 across all apps; we stay under a fifth so the workspace keeps its share.',
    },
};
