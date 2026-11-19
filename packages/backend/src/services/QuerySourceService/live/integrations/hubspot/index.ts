import {
    ApiConnectorType,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_ORIGIN,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    jsonRequest,
} from '../../integration';
import { getIsoDateInTimeZone } from '../../query/dateRange';
import { compileHubspotQuery } from './compile';
import { toHubspotError } from './errors';
import {
    HUBSPOT_BOOLEAN_FILTERS,
    HUBSPOT_DATE_FILTERS,
    HUBSPOT_MAX_PAGES,
    HUBSPOT_MAX_ROWS,
    HUBSPOT_NUMBER_FILTERS,
    HUBSPOT_RECORDS_EXPLORE,
    HUBSPOT_TEXT_FILTERS,
    isInternalHubspotField,
    withHubspotPropertyFields,
} from './explores';
import {
    hubspotRequestSchema,
    runHubspotQuery,
    scanHubspotProperties,
} from './run';
import { summarizeHubspotTest } from './testSummary';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.HUBSPOT];
const LABEL = CATALOG.messageLabel;

export const hubspotIntegration = defineLiveIntegration({
    connector: ApiConnectorType.HUBSPOT,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [HUBSPOT_ORIGIN],
    access: ({ object }) => ({
        pathPrefixes: [
            getHubspotPropertiesPath(object),
            getHubspotSearchPath(object),
        ],
        // Records are searched with POST, properties read with GET
        methods: ['GET', 'POST'],
    }),
    // HubSpot allows about 5 searches a second per account, and private
    // apps 100 to 190 calls per 10 seconds by plan.
    limits: {
        concurrentCalls: 2,
        callsPerMinute: 240,
        callsPerHour: 10_000,
        callsPerQuery: HUBSPOT_MAX_PAGES,
        timeoutMs: 30_000,
        maxRows: HUBSPOT_MAX_ROWS,
    },
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
    explores: [HUBSPOT_RECORDS_EXPLORE],
    plannedModelNames: [],
    validate: ({ object }) => {
        if (!(HUBSPOT_OBJECTS as readonly string[]).includes(object)) {
            throw new ParameterError(
                `The HubSpot object must be one of ${HUBSPOT_OBJECTS.join(
                    ', ',
                )}`,
            );
        }
    },
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'HubSpot live data sources authenticate with a private app access token',
            );
        }
    },
    describeTarget: ({ settings: { object } }) => `HubSpot ${object}`,
    parseRequest: jsonRequest(`${LABEL} search`, hubspotRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileHubspotQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runHubspotQuery,
    toError: (response, settings) => toHubspotError(response, settings),
    summarizeTest: summarizeHubspotTest,
    scan: {
        read: scanHubspotProperties,
        withScannedFields: (definition, scan) =>
            scan.hubspotProperties
                ? withHubspotPropertyFields(definition, scan.hubspotProperties)
                : definition,
        isInternalField: isInternalHubspotField,
    },
});
