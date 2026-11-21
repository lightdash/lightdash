import {
    ApiConnectorType,
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
    ATTIO_MAX_PAGES,
    ATTIO_MAX_RECORDS,
    ATTIO_RECORDS_EXPLORE,
    withAttioAttributeFields,
} from './explores';
import { attioRequestSchema, runAttioQuery, scanAttioAttributes } from './run';
import { attioUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.ATTIO];
const LABEL = CATALOG.messageLabel;
// A slug like companies or deals, or the object's id
const ATTIO_OBJECT =
    /^(?:[a-z0-9_]{1,64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const attioIntegration = defineLiveIntegration({
    connector: ApiConnectorType.ATTIO,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [ATTIO_ORIGIN],
    access: ({ object }) => ({
        pathPrefixes: [
            getAttioAttributesPath(object),
            getAttioRecordsQueryPath(object),
        ],
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
    explores: [ATTIO_RECORDS_EXPLORE],
    plannedModelNames: [],
    level: {
        value: 2,
        description:
            'No. Attio has no aggregates, so counts are computed locally.',
    },
    auth: {
        description:
            'Offers a token and OAuth sign-in. No vendor review is needed.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'no_review',
    },
    paging: { description: '500 records a page, up to 20 pages (9,999 rows).' },
    rateLimiting: {
        description:
            '100 reads a second per workspace; list queries scored by filters and sorts over 10 seconds. Well under the read limit; filter-heavy queries are scored more tightly.',
    },
    useCases: attioUseCases,
    validate: ({ object }) => {
        if (!ATTIO_OBJECT.test(object)) {
            throw new ParameterError(
                "The Attio object must be its slug, like companies or deals, as shown in Attio's workspace settings under Objects",
            );
        }
    },
    checkAuth: ({ type }) => {
        if (type !== 'bearer_token') {
            throw new ParameterError(
                'Attio connections authenticate with an access token',
            );
        }
    },
    describeTarget: ({ settings: { object } }) => `Attio object ${object}`,
    parseRequest: jsonRequest(LABEL, attioRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileAttioQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runAttioQuery,
    toError: (response, settings) => toAttioError(response, settings),
    scan: {
        read: scanAttioAttributes,
        withScannedFields: (definition, scan) =>
            scan.attioAttributes
                ? withAttioAttributeFields(definition, scan.attioAttributes)
                : definition,
        isInternalField: isInternalAttioField,
    },
});
