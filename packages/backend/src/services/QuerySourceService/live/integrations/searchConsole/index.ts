import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    getIsoDateInTimeZone,
    readRule,
} from '../../sdk';
import { toGoogleApiError } from '../google/errors';
import { assertGoogleSignIn } from '../google/signIn';
import { compileSearchConsoleQuery } from './compile';
import { SEARCH_CONSOLE_EXPLORES } from './explores';
import {
    SEARCH_CONSOLE_DATE_FILTERS,
    SEARCH_CONSOLE_STRING_FILTERS,
} from './filters';
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
    kind: 'reports',
    connection: {
        settings: CATALOG.settings,
        origins: [SEARCH_CONSOLE_ORIGIN],
        // The token already limits the source to sites the account can read.
        access: () => ({
            rules: [readRule('POST', SEARCH_CONSOLE_SITES_PATH)],
        }),
        checkAuth: (connection) => assertGoogleSignIn(LABEL, connection),
        validate: ({ siteUrl }) => {
            if (!SITE_URL.test(siteUrl)) {
                throw new ParameterError(
                    'The Search Console site must look like https://example.com/ or sc-domain:example.com',
                );
            }
        },
        describeTarget: ({ settings: { siteUrl } }) =>
            `Search Console site ${siteUrl}`,
    },
    model: {
        explores: SEARCH_CONSOLE_EXPLORES,
        plannedNames: ['search_appearance'],
    },
    query: {
        request: searchConsoleRequestSchema,
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
        limits: {
            callsPerQuery: 1,
            timeoutMs: 30_000,
            maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
        },
    },
    spec: {
        auth: {
            description:
                'Needs Google verification of the scope; unverified apps show a warning screen and are capped at 100 users.',
            testWith: 'real_account',
            needs: ['gmail', 'invite'],
            token: false,
            oauth: 'needs_review',
        },
        paging: {
            description:
                'One call returns up to 25,000 rows; startRow pages beyond that.',
        },
        // Search Analytics allows 1,200 queries a minute per site and per user.
        rateLimits: {
            concurrentCalls: 5,
            callsPerSecond: null,
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
        },
        useCases: searchConsoleUseCases,
    },
});
