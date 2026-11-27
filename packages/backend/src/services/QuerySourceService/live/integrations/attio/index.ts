import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    ATTIO_ORIGIN,
    ATTIO_WORKSPACE_MEMBERS_PATH,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
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
import { ATTIO_MAX_PAGES, ATTIO_MAX_RECORDS, ATTIO_PAGE_SIZE } from './api';
import { isInternalAttioField } from './attributes';
import { compileAttioQuery } from './compile';
import { toAttioError } from './errors';
import { ATTIO_EXPLORES } from './explores';
import {
    ATTIO_BOOLEAN_FILTERS,
    ATTIO_DATE_FILTERS,
    ATTIO_NUMBER_FILTERS,
    ATTIO_TEXT_FILTERS,
} from './filters';
import {
    attioRequestSchema,
    runAttioQuery,
    scanAttioAttributes,
    type AttioCatalog,
} from './run';
import {
    ATTIO_SCANNED_MODELS,
    readAttioAttributes,
    toAttioObject,
    withAttioAttributeFields,
} from './scanFields';
import { attioUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.ATTIO];
const LABEL = CATALOG.messageLabel;

export const attioIntegration = defineLiveIntegration({
    connector: ApiConnectorType.ATTIO,
    label: LABEL,
    kind: 'records',
    connection: {
        settings: CATALOG.settings,
        origins: [ATTIO_ORIGIN],
        access: () => ({
            rules: [
                ...ATTIO_OBJECTS.flatMap((object) => [
                    readRule('GET', getAttioAttributesPath(object)),
                    readRule('POST', getAttioRecordsQueryPath(object)),
                ]),
                readRule('GET', ATTIO_WORKSPACE_MEMBERS_PATH),
            ],
        }),
        checkAuth: ({ type }) => {
            if (type !== 'bearer_token') {
                throw new ParameterError(
                    'Attio connections authenticate with an access token',
                );
            }
        },
        describeTarget: () =>
            'Attio workspace: companies, people, deals, users and workspaces',
    },
    model: {
        explores: ATTIO_EXPLORES,
        discovery: {
            discover: scanAttioAttributes,
            withFields: (definition, catalog: AttioCatalog) =>
                withAttioAttributeFields(
                    definition,
                    readAttioAttributes(
                        catalog.attioAttributes,
                        toAttioObject(definition.name),
                    ),
                ),
            isInternalField: isInternalAttioField,
            // Companies is the first explore; the other objects are scanned too
            models: ATTIO_SCANNED_MODELS,
        },
    },
    query: {
        request: attioRequestSchema,
        compile: ({ explore, metricQuery, now }) =>
            compileAttioQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, 'UTC'),
            }),
        run: runAttioQuery,
        toError: (response) => toAttioError(response),
        // Attio's filter takes any mix of $and, $or and $not. Dates are UTC days.
        capabilities: {
            filters: {
                operators: {
                    string: ATTIO_TEXT_FILTERS,
                    number: ATTIO_NUMBER_FILTERS,
                    boolean: ATTIO_BOOLEAN_FILTERS,
                    date: ATTIO_DATE_FILTERS,
                    timestamp: ATTIO_DATE_FILTERS,
                },
                multipleValues: true,
                or: true,
                nestedGroups: true,
            },
            metricFilters: false,
            dates: {
                rangeRequired: false,
                operators: ATTIO_DATE_FILTERS,
                grains: [TimeFrames.DAY],
                timezone: 'fixed',
            },
            pushdown: ALL_PUSHDOWN_REFUSED,
        },
        limits: {
            // The record pages, plus one call for owner names when they're selected
            callsPerQuery: ATTIO_MAX_PAGES + 1,
            timeoutMs: 30_000,
            maxRows: ATTIO_MAX_RECORDS,
            pageSize: ATTIO_PAGE_SIZE,
            // Attio allows 100 reads a second per workspace, and scores list
            // queries by their filters and sorts over a 10-second window.
            concurrentCalls: 3,
            callsPerSecond: 50,
            buckets: [
                {
                    id: 'minute',
                    label: 'per minute',
                    windowMs: 60_000,
                    capacity: 600,
                },
                {
                    id: 'hour',
                    label: 'per hour',
                    windowMs: 3_600_000,
                    capacity: 20_000,
                },
            ],
            note: 'List queries are also scored by their filters and sorts over 10 seconds; Attio publishes no threshold.',
        },
    },
    spec: {
        auth: {
            description: 'No vendor review is needed.',
            testWith: 'test_account',
            needs: ['gmail'],
            token: true,
            oauth: 'no_review',
        },
        useCases: attioUseCases,
    },
});
