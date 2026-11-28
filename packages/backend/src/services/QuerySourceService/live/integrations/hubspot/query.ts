import { ApiConnectorType, TimeFrames } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { HUBSPOT_MAX_ROWS, HUBSPOT_PAGE_SIZE, toHubspotError } from './api';
import { compileHubspotQuery } from './compile';
import {
    HUBSPOT_BOOLEAN_FILTERS,
    HUBSPOT_DATE_FILTERS,
    HUBSPOT_NUMBER_FILTERS,
    HUBSPOT_TEXT_FILTERS,
} from './model';
import {
    hubspotRequestSchema,
    runHubspotQuery,
    type HubspotRequest,
} from './run';

export const hubspotQuery: LiveQuery<ApiConnectorType.HUBSPOT, HubspotRequest> =
    {
        request: hubspotRequestSchema,
        compile: ({ explore, metricQuery, now }) =>
            compileHubspotQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, 'UTC'),
            }),
        run: runHubspotQuery,
        toError: toHubspotError,
        // One search takes one group of filters that all match. Dates are UTC days.
        capabilities: {
            filters: {
                operators: {
                    string: HUBSPOT_TEXT_FILTERS,
                    number: HUBSPOT_NUMBER_FILTERS,
                    boolean: HUBSPOT_BOOLEAN_FILTERS,
                    date: HUBSPOT_DATE_FILTERS,
                    timestamp: HUBSPOT_DATE_FILTERS,
                },
                multipleValues: true,
                or: false,
                nestedGroups: false,
            },
            metricFilters: false,
            dates: {
                rangeRequired: false,
                operators: HUBSPOT_DATE_FILTERS,
                grains: [TimeFrames.DAY],
                timezone: 'fixed',
            },
            pushdown: ALL_PUSHDOWN_REFUSED,
        },
        limits: {
            timeoutMs: 30_000,
            maxRows: HUBSPOT_MAX_ROWS,
            pageSize: HUBSPOT_PAGE_SIZE,
            // HubSpot allows about 5 searches a second per account, and private
            // apps 100 to 190 calls per 10 seconds by plan.
            concurrentCalls: 5,
            callsPerSecond: 4,
            buckets: [
                {
                    id: 'hour',
                    label: 'per hour',
                    windowMs: 3_600_000,
                    capacity: 10_000,
                },
            ],
        },
    };
