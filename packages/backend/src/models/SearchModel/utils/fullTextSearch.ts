import { Knex } from 'knex';

export function getFullTextSearchRankColumn(
    database: Knex,
    tableName: string,
    searchVectorColumnName: string,
    query: string,
    searchRankColumnName = 'search_rank',
) {
    const searchRankRawSql = database.raw(
        `ts_rank(${tableName}.${searchVectorColumnName}, websearch_to_tsquery(?), 0) as ${searchRankColumnName}`,
        [query],
    );

    return {
        searchRankRawSql,
        searchRankColumnName,
    };
}
