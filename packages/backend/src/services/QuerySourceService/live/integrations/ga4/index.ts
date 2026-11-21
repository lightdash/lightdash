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
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { toGoogleApiError } from '../google/errors';
import { assertGoogleSignIn } from '../google/signIn';
import { compileGa4Query, GA4_PERIOD_FORMATS } from './compile';
import {
    GA4_DATE_FILTERS,
    GA4_METRIC_FILTERS,
    GA4_REPORT_EXPLORE,
    GA4_STRING_FILTERS,
    withGa4MetadataFields,
} from './explores';
import {
    GA4_DATA_ORIGIN,
    GA4_MAX_QUERY_ROWS,
    ga4RequestSchema,
    getGa4MetadataPath,
    getGa4ReportPath,
    runGa4Query,
    scanGa4Metadata,
} from './run';
import { ga4UseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.GA4];
const LABEL = CATALOG.messageLabel;
const GA4_PROPERTY_ID = /^\d{1,20}$/;

export const ga4Integration = defineLiveIntegration({
    connector: ApiConnectorType.GA4,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [GA4_DATA_ORIGIN],
    access: ({ propertyId }) => ({
        pathPrefixes: [
            getGa4ReportPath(propertyId),
            getGa4MetadataPath(propertyId),
        ],
        // GET reads the property metadata the semantic layer scans
        methods: ['POST', 'GET'],
    }),
    // Standard properties allow 10 concurrent requests; reports spend hourly
    // tokens per property, which Google enforces and reports back.
    limits: {
        concurrentCalls: 5,
        callsPerMinute: 60,
        callsPerHour: 1_000,
        callsPerQuery: 1,
        timeoutMs: 30_000,
        maxRows: GA4_MAX_QUERY_ROWS,
    },
    // runReport filters any field with AND, OR and NOT groups, and metrics
    // too. Dates are one range in the property's time zone, which the API
    // can't override, grouped by day, ISO week, month or year. Everything
    // SQL-like is refused.
    periodFormats: GA4_PERIOD_FORMATS,
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
    explores: [GA4_REPORT_EXPLORE],
    plannedModelNames: ['ecommerce'],
    level: {
        value: 3,
        description: 'Yes. Reports return totals per dimension.',
    },
    auth: {
        description:
            'Offers OAuth sign-in. Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: false,
        oauth: 'needs_review',
    },
    paging: { description: 'One report call, up to 24,999 rows.' },
    rateLimiting: {
        description:
            'Standard properties: 10 requests at once, plus hourly and daily tokens per property. Half the concurrent limit; Google reports token use back.',
    },
    useCases: ga4UseCases,
    validate: ({ propertyId }) => {
        if (!GA4_PROPERTY_ID.test(propertyId)) {
            throw new ParameterError('The GA4 property ID must be a number');
        }
    },
    checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
    describeTarget: ({ settings: { propertyId }, targetLabel }) =>
        targetLabel
            ? `Google Analytics property "${targetLabel}" (ID ${propertyId})`
            : `Google Analytics property ${propertyId}`,
    parseRequest: jsonRequest('GA4 report', ga4RequestSchema),
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
    scan: {
        read: scanGa4Metadata,
        withScannedFields: (definition, scan) =>
            withGa4MetadataFields(definition, scan.ga4Metadata),
    },
});
