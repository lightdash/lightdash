import { ApiConnectorType } from '@lightdash/common';
import { ALL_PUSHDOWN_REFUSED, type LiveQuery } from '../../sdk';
import { toAirtableError } from './api';
import { compileAirtableQuery } from './compile';
import {
    AIRTABLE_BOOLEAN_FILTERS,
    AIRTABLE_DATE_FILTERS,
    AIRTABLE_NUMBER_FILTERS,
    AIRTABLE_TEXT_FILTERS,
    AIRTABLE_TIMESTAMP_FILTERS,
} from './model';
import {
    AIRTABLE_MAX_PAGES,
    AIRTABLE_MAX_QUERY_ROWS,
    AIRTABLE_PAGE_SIZE,
    airtableRequestSchema,
    runAirtableQuery,
    type AirtableRequest,
} from './run';

export const airtableQuery: LiveQuery<
    ApiConnectorType.AIRTABLE,
    AirtableRequest
> = {
    request: airtableRequestSchema,
    compile: ({ explore, metricQuery }) =>
        compileAirtableQuery({ explore, metricQuery }),
    run: runAirtableQuery,
    toError: toAirtableError,
    // Filters become one Airtable formula, so AND and OR groups both work.
    // Dates are compared in UTC.
    capabilities: {
        filters: {
            operators: {
                string: AIRTABLE_TEXT_FILTERS,
                number: AIRTABLE_NUMBER_FILTERS,
                boolean: AIRTABLE_BOOLEAN_FILTERS,
                date: AIRTABLE_DATE_FILTERS,
                timestamp: AIRTABLE_TIMESTAMP_FILTERS,
            },
            multipleValues: true,
            or: true,
            nestedGroups: true,
        },
        metricFilters: false,
        dates: {
            rangeRequired: false,
            operators: AIRTABLE_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    // Airtable allows 5 calls a second per base and answers more with 429 and
    // a 30-second wait; a token allows 50 a second across its bases.
    limits: {
        timeoutMs: 30_000,
        maxRows: AIRTABLE_MAX_QUERY_ROWS,
        pageSize: AIRTABLE_PAGE_SIZE,
        callsPerQuery: AIRTABLE_MAX_PAGES,
        concurrentCalls: 3,
        callsPerSecond: 5,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 300,
            },
        ],
        note: 'Airtable allows 5 calls a second per base; past it, every call fails for 30 seconds.',
    },
};
