import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { toGoogleApiError } from '../google/errors';
import { compileSearchConsoleQuery } from './compile';
import {
    SEARCH_CONSOLE_DATE_FILTERS,
    SEARCH_CONSOLE_STRING_FILTERS,
} from './model';
import {
    runSearchConsoleQuery,
    SEARCH_CONSOLE_MAX_QUERY_ROWS,
    searchConsoleRequestSchema,
    type SearchConsoleRequest,
} from './run';

const LABEL =
    LIVE_INTEGRATION_CATALOG[ApiConnectorType.SEARCH_CONSOLE].messageLabel;
// Search Console reports dates in Pacific Time, whatever the property.
const TIME_ZONE = 'America/Los_Angeles';

export const searchConsoleQuery: LiveQuery<
    ApiConnectorType.SEARCH_CONSOLE,
    SearchConsoleRequest
> = {
    request: searchConsoleRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compileSearchConsoleQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, TIME_ZONE),
            maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
        }),
    run: runSearchConsoleQuery,
    toError: (response, { siteUrl }) =>
        toGoogleApiError(response, { label: LABEL, resource: siteUrl }),
    // Search Analytics ANDs one flat list of dimension filters and can't
    // filter metrics. Several values and prefix or suffix matches compile to
    // RE2 regex filters. Dates are one range in Pacific Time.
    capabilities: {
        filters: {
            operators: {
                string: SEARCH_CONSOLE_STRING_FILTERS,
                date: SEARCH_CONSOLE_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: SEARCH_CONSOLE_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        timeoutMs: 30_000,
        maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
        // Search Analytics allows 1,200 queries a minute per site and per user.
        concurrentCalls: 5,
        callsPerSecond: null,
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
    },
};
