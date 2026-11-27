import { ApiConnectorType, TimeFrames } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    LIVE_FILTERS,
    type LiveQuery,
} from '../../sdk';
import { toAmplitudeError } from './api';
import { compileAmplitudeQuery } from './compile';
import { AMPLITUDE_PROPERTY_FILTERS } from './model';
import {
    AMPLITUDE_CALLS_PER_QUERY,
    AMPLITUDE_MAX_QUERY_ROWS,
    amplitudeRequestSchema,
    runAmplitudeQuery,
    type AmplitudeRequest,
} from './run';

export const amplitudeQuery: LiveQuery<
    ApiConnectorType.AMPLITUDE,
    AmplitudeRequest
> = {
    request: amplitudeRequestSchema,
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileAmplitudeQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    run: runAmplitudeQuery,
    toError: (response) => toAmplitudeError(response),
    // Reports take one date range in the project's time zone, by day, week or
    // month, and segments of `is` and `is not` on user properties, ANDed.
    capabilities: {
        filters: {
            operators: {
                string: AMPLITUDE_PROPERTY_FILTERS,
                number: LIVE_FILTERS.equals,
                date: LIVE_FILTERS.dateRangeOrFrom,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: LIVE_FILTERS.dateRangeOrFrom,
            grains: [TimeFrames.DAY, TimeFrames.WEEK, TimeFrames.MONTH],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        callsPerQuery: AMPLITUDE_CALLS_PER_QUERY,
        timeoutMs: 60_000,
        maxRows: AMPLITUDE_MAX_QUERY_ROWS,
        // Amplitude limits the cost of the queries running at once per project
        // (a 61-day segmentation costs 600, and four of them were refused) and
        // their cost per hour (days × conditions × query type). One call at a
        // time stays under the first and leaves room for other clients.
        concurrentCalls: 1,
        callsPerSecond: null,
        buckets: [
            {
                id: 'minute',
                label: 'per minute',
                windowMs: 60_000,
                capacity: 60,
            },
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 1_000,
            },
        ],
        note: 'Amplitude limits query cost, not calls: 108,000 an hour, where one query costs days × conditions × a per-report factor, at least 10.',
        cardNote:
            'Amplitude limits query cost, not requests, so a request limit reduces use but does not cap cost.',
    },
};
