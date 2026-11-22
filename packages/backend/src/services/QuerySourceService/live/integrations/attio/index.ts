import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    ATTIO_ORIGIN,
    getAttioAttributesPath,
    getAttioRecordsQueryPath,
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
import {
    ATTIO_BOOLEAN_FILTERS,
    ATTIO_DATE_FILTERS,
    ATTIO_NUMBER_FILTERS,
    ATTIO_TEXT_FILTERS,
    isInternalAttioField,
} from './attributes';
import { compileAttioQuery } from './compile';
import { toAttioError } from './errors';
import {
    ATTIO_EXPLORES,
    ATTIO_MAX_PAGES,
    ATTIO_MAX_RECORDS,
    ATTIO_SCANNED_MODELS,
    readAttioAttributes,
    toAttioObject,
    withAttioAttributeFields,
} from './explores';
import { attioRequestSchema, runAttioQuery, scanAttioAttributes } from './run';
import { attioUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.ATTIO];
const LABEL = CATALOG.messageLabel;

export const attioIntegration = defineLiveIntegration({
    connector: ApiConnectorType.ATTIO,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [ATTIO_ORIGIN],
    access: () => ({
        pathPrefixes: ATTIO_OBJECTS.flatMap((object) => [
            getAttioAttributesPath(object),
            getAttioRecordsQueryPath(object),
        ]),
        // Records are read with POST, attributes with GET
        methods: ['GET', 'POST'],
    }),
    // Attio allows 100 reads a second per workspace, and scores list
    // queries by their filters and sorts over a 10-second window.
    limits: {
        concurrentCalls: 3,
        callsPerMinute: 600,
        callsPerHour: 20_000,
        callsPerQuery: ATTIO_MAX_PAGES,
        timeoutMs: 30_000,
        maxRows: ATTIO_MAX_RECORDS,
    },
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
    explores: ATTIO_EXPLORES,
    plannedModelNames: [],
    level: {
        value: 2,
        description: 'Attio has no aggregates; it returns records only.',
    },
    auth: {
        description: 'No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'no_review',
    },
    paging: { description: 'Up to 500 records a page, with limit and offset.' },
    rateLimiting: {
        description:
            '100 reads a second per workspace; list queries are scored by their filters and sorts over 10 seconds.',
    },
    useCases: attioUseCases,
    validate: () => {},
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Attio connections authenticate with an access token',
            );
        }
    },
    describeTarget: () =>
        'Attio workspace: companies, people, deals, users and workspaces',
    parseRequest: jsonRequest(LABEL, attioRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileAttioQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runAttioQuery,
    toError: (response) => toAttioError(response),
    scan: {
        read: scanAttioAttributes,
        withScannedFields: (definition, scan) =>
            withAttioAttributeFields(
                definition,
                readAttioAttributes(
                    scan.attioAttributes,
                    toAttioObject(definition.name),
                ),
            ),
        isInternalField: isInternalAttioField,
        // Companies is the first explore; the other objects are scanned too
        models: ATTIO_SCANNED_MODELS,
    },
});
