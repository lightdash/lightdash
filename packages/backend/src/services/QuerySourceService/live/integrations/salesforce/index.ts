import {
    ApiConnectorType,
    getSalesforceDescribePath,
    isSalesforceInstanceOrigin,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    SALESFORCE_LIMITS_PATH,
    SALESFORCE_OBJECTS,
    SALESFORCE_QUERY_PATH,
    SALESFORCE_TOKEN_URL,
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
    SALESFORCE_BOOLEAN_FILTERS,
    SALESFORCE_DATE_FILTERS,
    SALESFORCE_MAX_CALLS,
    SALESFORCE_MAX_RECORD_ROWS,
    SALESFORCE_METRIC_FILTERS,
    SALESFORCE_NUMBER_FILTERS,
    SALESFORCE_RECORDS_EXPLORE,
    SALESFORCE_TEXT_FILTERS,
    withSalesforceFields,
} from './explores';
import { runSalesforceQuery, scanSalesforceDescribe } from './run';
import { salesforceRequestSchema } from './soql';
import { summarizeSalesforceTest } from './testSummary';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SALESFORCE];
const LABEL = CATALOG.messageLabel;

export const salesforceIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SALESFORCE,
    label: LABEL,
    settings: CATALOG.settings,
    origins: ['https://<your domain>.my.salesforce.com'],
    acceptsOrigin: isSalesforceInstanceOrigin,
    access: ({ object }) => ({
        pathPrefixes: [
            SALESFORCE_QUERY_PATH,
            getSalesforceDescribePath(object),
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
    explores: [SALESFORCE_RECORDS_EXPLORE],
    plannedModelNames: [],
    validate: ({ object }) => {
        if (!(SALESFORCE_OBJECTS as readonly string[]).includes(object)) {
            throw new ParameterError(
                `The Salesforce object must be one of ${SALESFORCE_OBJECTS.join(
                    ', ',
                )}`,
            );
        }
    },
    checkAuth: ({ type, oauthTokenUrl }) => {
        if (
            type !== 'oauth_authorization_code' ||
            !oauthTokenUrl ||
            oauthTokenUrl !== SALESFORCE_TOKEN_URL
        ) {
            throw new ParameterError(
                'Salesforce live data sources sign in with Salesforce',
            );
        }
    },
    describeTarget: ({ settings: { object } }) =>
        `Salesforce ${object} records`,
    parseRequest: jsonRequest(`${LABEL} query`, salesforceRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileSalesforceQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runSalesforceQuery,
    toError: (response, settings) => toSalesforceError(response, settings),
    summarizeTest: summarizeSalesforceTest,
    scan: {
        read: scanSalesforceDescribe,
        withScannedFields: (definition, scan) =>
            scan.salesforceDescribe
                ? withSalesforceFields(definition, scan.salesforceDescribe)
                : definition,
        isInternalField: isInternalSalesforceField,
    },
});
