import { ApiQueryResults, Explore, SupportedDbtAdapter } from '..';

export const getCustomExploreFromQueryResultsAndSql = (
    sql: string,
    queryResults: ApiQueryResults,
): Explore => ({
    name: 'custom_explore',
    label: 'Untitled explore',
    tags: [],
    baseTable: 'custom_explore',
    joinedTables: [],
    sqlTable: 'custom_explore',
    tables: {
        custom_explore: {
            // these are all dimensions
            dimensions: queryResults.fields,
            sqlTable: `( ${sql} )`,
            metrics: {},
            lineageGraph: {},
        },
    },
    // TODO: support warehouse...
    targetDatabase: SupportedDbtAdapter.POSTGRES,
});
