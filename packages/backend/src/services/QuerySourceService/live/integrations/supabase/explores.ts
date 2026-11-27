import { type LiveExploreDefinition } from '../../sdk';

/**
 * The one explore of a source: the rows of its table. Its columns come from
 * the scan, so the definition itself has none.
 */
export const SUPABASE_TABLE_EXPLORE: LiveExploreDefinition = {
    name: 'table',
    label: 'Table',
    description:
        'Rows of one table or view in a Supabase project, read live through its Data API, one row per record.',
    aiHint: 'Read live from the Supabase Data API (PostgREST), one row per record of the table. There are no metrics: count, sum or average by aggregating rows. Filters, sorts and the row limit run in Supabase; one query reads at most 4,999 rows, so filter large tables.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [],
    metrics: [],
};

export const SUPABASE_EXPLORES = [SUPABASE_TABLE_EXPLORE] as const;
