import { ApiConnectorType, TimeFrames } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import {
    ATTIO_MAX_PAGES,
    ATTIO_MAX_RECORDS,
    ATTIO_PAGE_SIZE,
    toAttioError,
} from './api';
import { compileAttioQuery } from './compile';
import {
    ATTIO_BOOLEAN_FILTERS,
    ATTIO_DATE_FILTERS,
    ATTIO_NUMBER_FILTERS,
    ATTIO_TEXT_FILTERS,
} from './model';
import { attioRequestSchema, runAttioQuery, type AttioRequest } from './run';

export const attioQuery: LiveQuery<ApiConnectorType.ATTIO, AttioRequest> = {
    request: attioRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compileAttioQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runAttioQuery,
    toError: (response) => toAttioError(response),
    // Attio's filter takes any mix of $and, $or and $not. Dates are UTC days.
    capabilities: {
        filters: {
            operators: {
                string: ATTIO_TEXT_FILTERS,
                number: ATTIO_NUMBER_FILTERS,
                boolean: ATTIO_BOOLEAN_FILTERS,
                date: ATTIO_DATE_FILTERS,
                timestamp: ATTIO_DATE_FILTERS,
            },
            multipleValues: true,
            or: true,
            nestedGroups: true,
        },
        metricFilters: false,
        dates: {
            rangeRequired: false,
            operators: ATTIO_DATE_FILTERS,
            grains: [TimeFrames.DAY],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        // The record pages, plus one call for owner names when they're selected
        callsPerQuery: ATTIO_MAX_PAGES + 1,
        timeoutMs: 30_000,
        maxRows: ATTIO_MAX_RECORDS,
        pageSize: ATTIO_PAGE_SIZE,
        // Attio allows 100 reads a second per workspace, and scores list
        // queries by their filters and sorts over a 10-second window.
        concurrentCalls: 3,
        callsPerSecond: 50,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 600,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 20_000,
            },
        ],
        note: 'List queries are also scored by their filters and sorts over 10 seconds; Attio publishes no threshold.',
    },
};
