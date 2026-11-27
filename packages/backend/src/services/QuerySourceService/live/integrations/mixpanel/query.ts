import { ApiConnectorType, TimeFrames } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    LIVE_FILTERS,
    type LiveQuery,
} from '../../sdk';
import { toMixpanelError } from './api';
import { compileMixpanelQuery } from './compile';
import { MIXPANEL_PROPERTY_FILTERS } from './model';
import {
    MIXPANEL_CALLS_PER_QUERY,
    MIXPANEL_MAX_QUERY_ROWS,
    mixpanelRequestSchema,
    runMixpanelQuery,
    type MixpanelRequest,
} from './run';

export const mixpanelQuery: LiveQuery<
    ApiConnectorType.MIXPANEL,
    MixpanelRequest
> = {
    request: mixpanelRequestSchema,
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileMixpanelQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    run: runMixpanelQuery,
    toError: (response) => toMixpanelError(response),
    // Reports take one date range in the project's time zone, by day or month
    // (retention by day, week or month), and `where` filters of `==` and `!=`
    // on event properties, ANDed.
    capabilities: {
        filters: {
            operators: {
                string: MIXPANEL_PROPERTY_FILTERS,
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
        callsPerQuery: MIXPANEL_CALLS_PER_QUERY,
        timeoutMs: 60_000,
        maxRows: MIXPANEL_MAX_QUERY_ROWS,
        // Mixpanel allows 60 Query API calls an hour and 5 at once per project,
        // shared with every other client. One call at a time and 40 an hour leave
        // room for them.
        concurrentCalls: 1,
        callsPerSecond: null,
        buckets: [
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 40,
            },
        ],
        note: 'Mixpanel allows 60 queries an hour and 5 at once per project, shared with every other client; Lightdash keeps to 40 an hour.',
    },
};
