import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
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
import { compileSearchConsoleQuery } from './compile';
import {
    SEARCH_CONSOLE_DATE_FILTERS,
    SEARCH_CONSOLE_PERFORMANCE_EXPLORE,
    SEARCH_CONSOLE_STRING_FILTERS,
} from './explores';
import {
    runSearchConsoleQuery,
    SEARCH_CONSOLE_MAX_QUERY_ROWS,
    SEARCH_CONSOLE_ORIGIN,
    SEARCH_CONSOLE_SITES_PATH,
    searchConsoleRequestSchema,
} from './run';
import { searchConsoleUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SEARCH_CONSOLE];
const LABEL = CATALOG.messageLabel;
const SITE_URL = /^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s/?#]+\/[^\s?#]*)$/i;
// Search Console reports dates in Pacific Time, whatever the property.
const TIME_ZONE = 'America/Los_Angeles';

export const searchConsoleIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SEARCH_CONSOLE,
    label: LABEL,
    settings: CATALOG.settings,
    origins: [SEARCH_CONSOLE_ORIGIN],
    // The token already limits the source to sites the account can read.
    access: () => ({
        pathPrefixes: [SEARCH_CONSOLE_SITES_PATH],
        methods: ['POST'],
    }),
    // Search Analytics allows 1,200 queries a minute per site and per user.
    limits: {
        concurrentCalls: 5,
        callsPerMinute: 600,
        callsPerHour: 20_000,
        callsPerQuery: 1,
        timeoutMs: 30_000,
        maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
    },
    // Search Analytics ANDs one flat list of dimension filters and can't
    // filter metrics. Several values and prefix or suffix matches compile to
    // RE2 regex filters. Dates are one range in Pacific Time.
    capabilities: {
        filters: {
            operators: {
                string: SEARCH_CONSOLE_STRING_FILTERS,
                date: SEARCH_CONSOLE_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: SEARCH_CONSOLE_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    explores: [SEARCH_CONSOLE_PERFORMANCE_EXPLORE],
    plannedModelNames: ['search_appearance'],
    level: {
        value: 3,
        description: 'Yes. Reports return totals per dimension.',
    },
    auth: {
        description:
            'Offers OAuth sign-in. Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
        testWith: 'our_account',
        needs: ['gmail', 'someone_adds_us'],
        token: false,
        oauth: 'needs_review',
    },
    paging: { description: 'One call, up to 24,999 rows.' },
    rateLimiting: {
        description:
            'Search Analytics: 1,200 queries a minute per site and per user. Half the per-minute limit.',
    },
    useCases: searchConsoleUseCases,
    validate: ({ siteUrl }) => {
        if (!SITE_URL.test(siteUrl)) {
            throw new ParameterError(
                'The Search Console site must look like https://example.com/ or sc-domain:example.com',
            );
        }
    },
    checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
    describeTarget: ({ settings: { siteUrl } }) =>
        `Search Console site ${siteUrl}`,
    parseRequest: jsonRequest(LABEL, searchConsoleRequestSchema),
    compile: ({ explore, metricQuery, now }) =>
        compileSearchConsoleQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, TIME_ZONE),
            maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
        }),
    run: runSearchConsoleQuery,
    toError: (response, { siteUrl }) =>
        toGoogleApiError(response, { label: LABEL, resource: siteUrl }),
});
