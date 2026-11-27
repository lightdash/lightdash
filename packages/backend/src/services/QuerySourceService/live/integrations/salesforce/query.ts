import { ApiConnectorType, TimeFrames } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    LIVE_FILTERS,
    type LiveQuery,
} from '../../sdk';
import {
    SALESFORCE_MAX_CALLS,
    SALESFORCE_MAX_RECORD_ROWS,
    toSalesforceError,
} from './api';
import { compileSalesforceQuery } from './compile';
import {
    SALESFORCE_DATE_FILTERS,
    SALESFORCE_METRIC_FILTERS,
    SALESFORCE_NUMBER_FILTERS,
    SALESFORCE_TEXT_FILTERS,
} from './model';
import { runSalesforceQuery } from './run';
import { salesforceRequestSchema, type SalesforceRequest } from './soql';

export const salesforceQuery: LiveQuery<
    ApiConnectorType.SALESFORCE,
    SalesforceRequest
> = {
    request: salesforceRequestSchema,
    compile: ({ explore, metricQuery, now }) =>
        compileSalesforceQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runSalesforceQuery,
    toError: toSalesforceError,
    // SOQL takes any AND/OR tree in WHERE and HAVING. Dates group by UTC
    // calendar periods.
    capabilities: {
        filters: {
            operators: {
                string: SALESFORCE_TEXT_FILTERS,
                number: SALESFORCE_NUMBER_FILTERS,
                boolean: LIVE_FILTERS.equals,
                date: SALESFORCE_DATE_FILTERS,
                timestamp: SALESFORCE_DATE_FILTERS,
                metric: SALESFORCE_METRIC_FILTERS,
            },
            multipleValues: true,
            or: true,
            nestedGroups: true,
        },
        metricFilters: true,
        dates: {
            rangeRequired: false,
            operators: SALESFORCE_DATE_FILTERS,
            grains: [
                TimeFrames.DAY,
                TimeFrames.MONTH,
                TimeFrames.QUARTER,
                TimeFrames.YEAR,
            ],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        callsPerQuery: SALESFORCE_MAX_CALLS,
        timeoutMs: 60_000,
        maxRows: SALESFORCE_MAX_RECORD_ROWS,
        // Every call counts against the org's API calls per 24 hours (15,000 on
        // Developer Edition, 100,000 and up on paid editions), which its other
        // apps share. 500 an hour keeps one source under the smallest daily limit.
        concurrentCalls: 2,
        callsPerSecond: null,
        buckets: [
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 500,
            },
            {
                id: 'day',
                label: 'per day',
                windowMs: 86_400_000,
                capacity: 2_000,
            },
        ],
        note: "The org's daily API allowance is shared with its other apps.",
    },
};
