import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    TimeFrames,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveQuery,
} from '../../sdk';
import { toGoogleApiError } from '../google/errors';
import { compileGa4Query, GA4_PERIOD_FORMATS } from './compile';
import {
    GA4_DATE_FILTERS,
    GA4_METRIC_FILTERS,
    GA4_STRING_FILTERS,
} from './model';
import {
    GA4_MAX_QUERY_ROWS,
    ga4RequestSchema,
    runGa4Query,
    type Ga4Request,
} from './run';

const LABEL = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GA4].messageLabel;

export const ga4Query: LiveQuery<ApiConnectorType.GA4, Ga4Request> = {
    request: ga4RequestSchema,
    compile: ({ explore, metricQuery, timezone, now }) =>
        compileGa4Query({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, timezone),
        }),
    run: runGa4Query,
    toError: (response, { propertyId }) =>
        toGoogleApiError(response, {
            label: LABEL,
            resource: `property ${propertyId}`,
        }),
    capabilities: {
        filters: {
            operators: {
                string: GA4_STRING_FILTERS,
                date: GA4_DATE_FILTERS,
                metric: GA4_METRIC_FILTERS,
            },
            multipleValues: true,
            or: true,
            nestedGroups: true,
        },
        metricFilters: true,
        dates: {
            rangeRequired: true,
            operators: GA4_DATE_FILTERS,
            grains: [
                TimeFrames.DAY,
                TimeFrames.WEEK,
                TimeFrames.MONTH,
                TimeFrames.YEAR,
            ],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: {
        timeoutMs: 30_000,
        maxRows: GA4_MAX_QUERY_ROWS,
        // Standard properties allow 10 concurrent requests; reports spend hourly
        // tokens per property, which Google enforces and reports back.
        concurrentCalls: 5,
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
        note: 'GA4 counts quota in tokens per property, not calls.',
    },
    // runReport filters any field with AND, OR and NOT groups, and metrics
    // too. Dates are one range in the property's time zone, which the API
    // can't override, grouped by day, ISO week, month or year. Everything
    // SQL-like is refused.
    periodFormats: GA4_PERIOD_FORMATS,
};
