import { ApiConnectorType } from '@lightdash/common';
import { ALL_PUSHDOWN_REFUSED, type LiveQuery } from '../../sdk';
import { toSupabaseError } from './api';
import { compileSupabaseQuery } from './compile';
import {
    SUPABASE_BOOLEAN_FILTERS,
    SUPABASE_DATE_FILTERS,
    SUPABASE_NUMBER_FILTERS,
    SUPABASE_TEXT_FILTERS,
    SUPABASE_TIMESTAMP_FILTERS,
} from './model';
import {
    runSupabaseQuery,
    SUPABASE_MAX_QUERY_ROWS,
    SUPABASE_PAGE_SIZE,
    supabaseRequestSchema,
    type SupabaseRequest,
} from './run';

export const supabaseQuery: LiveQuery<
    ApiConnectorType.SUPABASE,
    SupabaseRequest
> = {
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
        timeoutMs: 30_000,
        maxRows: SUPABASE_MAX_QUERY_ROWS,
        pageSize: SUPABASE_PAGE_SIZE,
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
};
