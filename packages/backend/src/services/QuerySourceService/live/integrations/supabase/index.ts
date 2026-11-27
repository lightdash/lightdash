import {
    ApiConnectorType,
    isSupabaseOrigin,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    SUPABASE_REST_PATH,
} from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    defineLiveIntegration,
    readRule,
} from '../../sdk';
import { compileSupabaseQuery } from './compile';
import { toSupabaseError } from './errors';
import { SUPABASE_EXPLORES } from './explores';
import {
    SUPABASE_BOOLEAN_FILTERS,
    SUPABASE_DATE_FILTERS,
    SUPABASE_NUMBER_FILTERS,
    SUPABASE_TEXT_FILTERS,
    SUPABASE_TIMESTAMP_FILTERS,
} from './filters';
import {
    runSupabaseQuery,
    scanSupabaseTable,
    SUPABASE_MAX_PAGES,
    SUPABASE_MAX_QUERY_ROWS,
    supabaseRequestSchema,
    type SupabaseCatalog,
} from './run';
import { readSupabaseColumns, withSupabaseColumns } from './scanFields';
import { supabaseUseCases } from './useCases';

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SUPABASE];
const LABEL = CATALOG.messageLabel;

export const supabaseIntegration = defineLiveIntegration({
    connector: ApiConnectorType.SUPABASE,
    label: LABEL,
    kind: 'records',
    connection: {
        settings: CATALOG.settings,
        origins: ['https://<project ref>.supabase.co'],
        // Custom domains and self-hosted Supabase serve the same Data API
        acceptsOrigin: isSupabaseOrigin,
        // GET on the Data API only reads: tables, views, and functions declared
        // stable or immutable. Writes need POST, PATCH or DELETE.
        access: () => ({
            rules: [readRule('GET', SUPABASE_REST_PATH)],
        }),
        checkAuth: ({ type }) => {
            if (type !== 'api_key') {
                throw new ParameterError(
                    'Supabase live data sources sign in with a secret API key',
                );
            }
        },
        describeTarget: ({ settings: { table }, origin }) =>
            `Supabase table "${table}" in the project at ${origin}`,
    },
    model: {
        explores: SUPABASE_EXPLORES,
        discovery: {
            discover: scanSupabaseTable,
            withFields: (definition, catalog: SupabaseCatalog) =>
                withSupabaseColumns(
                    definition,
                    readSupabaseColumns(catalog.supabaseTable),
                ),
            // The columns are the explore, so a new source starts with all of them
            inUseByDefault: true,
        },
    },
    query: {
        request: supabaseRequestSchema,
        compile: ({ explore, metricQuery }) =>
            compileSupabaseQuery({ explore, metricQuery }),
        run: runSupabaseQuery,
        toError: toSupabaseError,
        // Filters are ANDed column filters; a list of values matches any of
        // them. Dates are compared in UTC.
        capabilities: {
            filters: {
                operators: {
                    string: SUPABASE_TEXT_FILTERS,
                    number: SUPABASE_NUMBER_FILTERS,
                    boolean: SUPABASE_BOOLEAN_FILTERS,
                    date: SUPABASE_DATE_FILTERS,
                    timestamp: SUPABASE_TIMESTAMP_FILTERS,
                },
                multipleValues: true,
                or: false,
                nestedGroups: false,
            },
            metricFilters: false,
            dates: {
                rangeRequired: false,
                operators: SUPABASE_DATE_FILTERS,
                grains: [],
                timezone: 'fixed',
            },
            pushdown: ALL_PUSHDOWN_REFUSED,
        },
        limits: {
            callsPerQuery: SUPABASE_MAX_PAGES,
            timeoutMs: 30_000,
            maxRows: SUPABASE_MAX_QUERY_ROWS,
        },
    },
    spec: {
        auth: {
            description:
                'No vendor review is needed. Reading the table list needs a secret or service_role key.',
            testWith: 'test_account',
            needs: ['gmail'],
            token: true,
            oauth: 'none',
        },
        paging: {
            description:
                "Rows come in pages set by limit and offset, up to the project's max rows per call (1,000 by default).",
        },
        rateLimits: {
            concurrentCalls: 3,
            callsPerSecond: 5,
            buckets: [
                {
                    id: 'minute',
                    label: 'per minute',
                    windowMs: 60_000,
                    capacity: 120,
                },
            ],
            note: "Supabase documents no Data API rate limit; reads use the project's database compute.",
        },
        useCases: supabaseUseCases,
    },
});
