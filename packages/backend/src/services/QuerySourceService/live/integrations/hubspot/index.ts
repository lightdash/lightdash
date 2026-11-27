import {
    ApiConnectorType,
    getHubspotPipelinesPath,
    getHubspotPropertiesPath,
    getHubspotSearchPath,
    HUBSPOT_OBJECTS,
    HUBSPOT_ORIGIN,
    HUBSPOT_PIPELINE_OBJECTS,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    TimeFrames,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    getIsoDateInTimeZone,
    readRule,
} from '../../sdk';
import { HUBSPOT_MAX_PAGES, HUBSPOT_MAX_ROWS } from './api';
import { compileHubspotQuery } from './compile';
import { toHubspotError } from './errors';
import { HUBSPOT_EXPLORES } from './explores';
import {
    HUBSPOT_BOOLEAN_FILTERS,
    HUBSPOT_DATE_FILTERS,
    HUBSPOT_NUMBER_FILTERS,
    HUBSPOT_TEXT_FILTERS,
} from './filters';
import {
    hubspotRequestSchema,
    runHubspotQuery,
    scanHubspotProperties,
    type HubspotCatalog,
} from './run';
import {
    isInternalHubspotField,
    readHubspotProperties,
    withHubspotPropertyFields,
} from './scanFields';
import { summarizeHubspotTest } from './testSummary';
import { hubspotUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.HUBSPOT];
const LABEL = CATALOG.messageLabel;

export const hubspotIntegration = defineLiveIntegration({
    connector: ApiConnectorType.HUBSPOT,
    label: LABEL,
    kind: 'records',
    connection: {
        settings: CATALOG.settings,
        origins: [HUBSPOT_ORIGIN],
        access: () => ({
            rules: [
                ...HUBSPOT_OBJECTS.flatMap((object) => [
                    readRule('GET', getHubspotPropertiesPath(object)),
                    readRule('POST', getHubspotSearchPath(object)),
                ]),
                ...HUBSPOT_PIPELINE_OBJECTS.map((object) =>
                    readRule('GET', getHubspotPipelinesPath(object)),
                ),
            ],
        }),
        checkAuth: ({ type }) => {
            if (type !== 'bearer_token') {
                throw new ParameterError(
                    'HubSpot live data sources authenticate with a private app access token',
                );
            }
        },
        describeTarget: () =>
            'HubSpot CRM: deals, contacts, companies, tickets and leads, plus deal and ticket pipeline stages',
        summarizeTest: summarizeHubspotTest,
    },
    model: {
        explores: HUBSPOT_EXPLORES,
        discovery: {
            discover: scanHubspotProperties,
            withFields: (definition, catalog: HubspotCatalog) =>
                withHubspotPropertyFields(
                    definition,
                    readHubspotProperties(
                        catalog.hubspotProperties,
                        definition.name,
                    ),
                ),
            isInternalField: isInternalHubspotField,
            // Deals is the first explore; the other objects are scanned too
            models: HUBSPOT_OBJECTS.slice(1),
        },
    },
    query: {
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
            callsPerQuery: HUBSPOT_MAX_PAGES,
            timeoutMs: 30_000,
            maxRows: HUBSPOT_MAX_ROWS,
        },
    },
    spec: {
        auth: {
            description: 'No vendor review is needed.',
            testWith: 'test_account',
            needs: ['gmail', 'phone'],
            token: true,
            oauth: 'no_review',
        },
        paging: {
            description:
                'Search returns up to 200 records a page and stops at 10,000 results.',
        },
        // HubSpot allows about 5 searches a second per account, and private
        // apps 100 to 190 calls per 10 seconds by plan.
        rateLimits: {
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
        useCases: hubspotUseCases,
    },
});
