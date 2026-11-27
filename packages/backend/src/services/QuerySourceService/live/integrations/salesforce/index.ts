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
    getIsoDateInTimeZone,
    readRule,
} from '../../sdk';
import {
    SALESFORCE_MAX_CALLS,
    SALESFORCE_MAX_RECORD_ROWS,
    toSalesforceObject,
} from './api';
import { compileSalesforceQuery } from './compile';
import { toSalesforceError } from './errors';
import { SALESFORCE_EXPLORES } from './explores';
import {
    SALESFORCE_BOOLEAN_FILTERS,
    SALESFORCE_DATE_FILTERS,
    SALESFORCE_METRIC_FILTERS,
    SALESFORCE_NUMBER_FILTERS,
    SALESFORCE_TEXT_FILTERS,
} from './filters';
import {
    runSalesforceQuery,
    scanSalesforceDescribe,
    type SalesforceCatalog,
} from './run';
import {
    isInternalSalesforceField,
    readSalesforceDescribe,
    SALESFORCE_SCANNED_MODELS,
    withSalesforceFields,
} from './scanFields';
import { salesforceRequestSchema } from './soql';
import { summarizeSalesforceTest } from './testSummary';
import { salesforceUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SALESFORCE];
const LABEL = CATALOG.messageLabel;

export const salesforceIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SALESFORCE,
    label: LABEL,
    kind: 'records',
    connection: {
        settings: CATALOG.settings,
        origins: ['https://<your domain>.my.salesforce.com'],
        acceptsOrigin: isSalesforceInstanceOrigin,
        access: () => ({
            rules: [
                readRule('GET', SALESFORCE_QUERY_PATH),
                ...SALESFORCE_OBJECTS.map((object) =>
                    readRule('GET', getSalesforceDescribePath(object)),
                ),
                readRule('GET', SALESFORCE_LIMITS_PATH),
            ],
        }),
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
        summarizeTest: summarizeSalesforceTest,
    },
    model: {
        explores: SALESFORCE_EXPLORES,
        discovery: {
            discover: scanSalesforceDescribe,
            withFields: (definition, catalog: SalesforceCatalog) =>
                withSalesforceFields(
                    definition,
                    readSalesforceDescribe(
                        catalog.salesforceDescribe,
                        toSalesforceObject(definition.name),
                    ),
                ),
            isInternalField: isInternalSalesforceField,
            // Opportunities is the first explore; the other objects are scanned too
            models: SALESFORCE_SCANNED_MODELS,
        },
    },
    query: {
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
    },
    spec: {
        auth: {
            description: 'No vendor review is needed.',
            testWith: 'test_account',
            needs: ['gmail'],
            token: false,
            oauth: 'no_review',
        },
        useCases: salesforceUseCases,
    },
});
