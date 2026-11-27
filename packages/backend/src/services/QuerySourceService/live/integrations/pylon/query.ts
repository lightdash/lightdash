import { ApiConnectorType } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    LIVE_FILTERS,
    type LiveQuery,
} from '../../sdk';
import { toPylonError } from './api';
import { compilePylonQuery } from './compile';
import {
    PYLON_DATE_FILTERS,
    PYLON_NUMBER_FILTERS,
    PYLON_VALUE_FILTERS,
} from './model';
import {
    PYLON_CALLS_PER_QUERY,
    PYLON_MAX_QUERY_ROWS,
    PYLON_PAGE_SIZE,
    pylonRequestSchema,
    runPylonQuery,
    type PylonRequest,
} from './run';

export const pylonQuery: LiveQuery<ApiConnectorType.PYLON, PylonRequest> = {
    request: pylonRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compilePylonQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runPylonQuery,
    toError: (response) => toPylonError(response),
    // One AND of search filters, each taking a list of values. Issues are
    // searched by a range of creation days; dates are UTC days.
    capabilities: {
        filters: {
            operators: {
                string: [
                    ...PYLON_VALUE_FILTERS,
                    ...LIVE_FILTERS.contains,
                    ...LIVE_FILTERS.nullChecks,
                ],
                number: PYLON_NUMBER_FILTERS,
                date: PYLON_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: PYLON_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        callsPerQuery: PYLON_CALLS_PER_QUERY,
        timeoutMs: 30_000,
        maxRows: PYLON_MAX_QUERY_ROWS,
        pageSize: PYLON_PAGE_SIZE,
        // Each search endpoint allows 120 calls a minute per workspace
        concurrentCalls: 3,
        callsPerSecond: 2,
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
                capacity: 3_000,
            },
        ],
    },
};
