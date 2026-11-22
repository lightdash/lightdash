import {
    ApiConnectorType,
    getSalesforceDescribePath,
    getSalesforceEnvironment,
    isSalesforceInstanceOrigin,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    SALESFORCE_LIMITS_PATH,
    SALESFORCE_OBJECTS,
    SALESFORCE_QUERY_PATH,
    TimeFrames,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileSalesforceQuery } from './compile';
import { toSalesforceError } from './errors';
import {
    isInternalSalesforceField,
    readSalesforceDescribe,
    SALESFORCE_BOOLEAN_FILTERS,
    SALESFORCE_DATE_FILTERS,
    SALESFORCE_EXPLORES,
    SALESFORCE_MAX_CALLS,
    SALESFORCE_MAX_RECORD_ROWS,
    SALESFORCE_METRIC_FILTERS,
    SALESFORCE_NUMBER_FILTERS,
    SALESFORCE_SCANNED_MODELS,
    SALESFORCE_TEXT_FILTERS,
    toSalesforceObject,
    withSalesforceFields,
} from './explores';
import { runSalesforceQuery, scanSalesforceDescribe } from './run';
import { salesforceRequestSchema } from './soql';
import { summarizeSalesforceTest } from './testSummary';
import { salesforceUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SALESFORCE];
const LABEL = CATALOG.messageLabel;

export const salesforceIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SALESFORCE,
    label: LABEL,
    settings: CATALOG.settings,
    origins: ['https://<your domain>.my.salesforce.com'],
    acceptsOrigin: isSalesforceInstanceOrigin,
    access: () => ({
        pathPrefixes: [
            SALESFORCE_QUERY_PATH,
            ...SALESFORCE_OBJECTS.map(getSalesforceDescribePath),
            SALESFORCE_LIMITS_PATH,
        ],
        methods: ['GET'],
    }),
    // Every call counts against the org's API calls per 24 hours (15,000 on
    // Developer Edition, 100,000 and up on paid editions), which its other
    // apps share. 500 an hour keeps one source under the smallest daily limit.
    limits: {
        concurrentCalls: 2,
        callsPerMinute: 60,
        callsPerHour: 500,
        callsPerQuery: SALESFORCE_MAX_CALLS,
        timeoutMs: 60_000,
        maxRows: SALESFORCE_MAX_RECORD_ROWS,
    },
    // SOQL takes any AND/OR tree in WHERE and HAVING. Dates group by UTC
    // calendar periods.
    capabilities: {
        filters: {
            operators: {
                string: SALESFORCE_TEXT_FILTERS,
                number: SALESFORCE_NUMBER_FILTERS,
                boolean: SALESFORCE_BOOLEAN_FILTERS,
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
    explores: SALESFORCE_EXPLORES,
    plannedModelNames: [],
    // The sign-in decides the org; the settings name only the connector
    level: {
        value: 4,
        description:
            'SOQL supports GROUP BY and aggregates (COUNT, SUM, AVG), so Salesforce totals itself.',
    },
    auth: {
        description: 'No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: false,
        oauth: 'no_review',
    },
    paging: {
        description:
            'Records come in batches of up to 2,000, followed by a next-records URL; aggregate queries return up to 2,000 groups.',
    },
    rateLimiting: {
        description:
            "API calls per 24 hours per org (15,000 on Developer Edition, 100,000 and up on paid), shared with the org's other apps.",
    },
    useCases: salesforceUseCases,
    validate: () => {},
    checkAuth: ({ type, oauthTokenUrl }) => {
        if (
            type !== 'oauth_authorization_code' ||
            getSalesforceEnvironment(oauthTokenUrl ?? null) === null
        ) {
            throw new ParameterError(
                'Salesforce live data sources sign in with Salesforce',
            );
        }
    },
    describeTarget: () =>
        'Salesforce org: opportunities, accounts, leads and contacts',
    parseRequest: jsonRequest(`${LABEL} query`, salesforceRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileSalesforceQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runSalesforceQuery,
    toError: toSalesforceError,
    summarizeTest: summarizeSalesforceTest,
    scan: {
        read: scanSalesforceDescribe,
        withScannedFields: (definition, scan) =>
            withSalesforceFields(
                definition,
                readSalesforceDescribe(
                    scan.salesforceDescribe,
                    toSalesforceObject(definition.name),
                ),
            ),
        isInternalField: isInternalSalesforceField,
        // Opportunities is the first explore; the other objects are scanned too
        models: SALESFORCE_SCANNED_MODELS,
    },
});
