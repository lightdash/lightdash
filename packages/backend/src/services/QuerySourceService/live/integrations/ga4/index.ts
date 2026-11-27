import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    getIsoDateInTimeZone,
    readRule,
} from '../../sdk';
import { toGoogleApiError } from '../google/errors';
import { assertGoogleSignIn } from '../google/signIn';
import { compileGa4Query, GA4_PERIOD_FORMATS } from './compile';
import { GA4_EXPLORES } from './explores';
import {
    GA4_DATE_FILTERS,
    GA4_METRIC_FILTERS,
    GA4_STRING_FILTERS,
} from './filters';
import {
    GA4_DATA_ORIGIN,
    GA4_MAX_QUERY_ROWS,
    ga4RequestSchema,
    getGa4MetadataPath,
    getGa4ReportPath,
    runGa4Query,
    scanGa4Metadata,
    type Ga4Catalog,
} from './run';
import { withGa4MetadataFields } from './scanFields';
import { ga4UseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GA4];
const LABEL = CATALOG.messageLabel;
const GA4_PROPERTY_ID = /^\d{1,20}$/;

export const ga4Integration = defineLiveIntegration({
    connector: ApiConnectorType.GA4,
    label: LABEL,
    kind: 'reports',
    connection: {
        settings: CATALOG.settings,
        origins: [GA4_DATA_ORIGIN],
        access: ({ propertyId }) => ({
            rules: [
                readRule('POST', getGa4ReportPath(propertyId)),
                readRule('GET', getGa4MetadataPath(propertyId)),
            ],
        }),
        checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
        validate: ({ propertyId }) => {
            if (!GA4_PROPERTY_ID.test(propertyId)) {
                throw new ParameterError(
                    'The GA4 property ID must be a number',
                );
            }
        },
        describeTarget: ({ settings: { propertyId }, targetLabel }) =>
            targetLabel
                ? `Google Analytics property "${targetLabel}" (ID ${propertyId})`
                : `Google Analytics property ${propertyId}`,
    },
    model: {
        explores: GA4_EXPLORES,
        plannedNames: ['ecommerce'],
        discovery: {
            discover: scanGa4Metadata,
            withFields: (definition, catalog: Ga4Catalog) =>
                withGa4MetadataFields(definition, catalog.ga4Metadata),
        },
    },
    query: {
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
    },
    spec: {
        auth: {
            description:
                'Needs Google verification of the scope; unverified apps show a warning screen and are capped at 100 users.',
            testWith: 'test_account',
            needs: ['gmail'],
            token: false,
            oauth: 'needs_review',
        },
        useCases: ga4UseCases,
    },
});
