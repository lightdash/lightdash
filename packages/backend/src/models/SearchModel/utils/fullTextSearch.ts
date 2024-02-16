import { Knex } from 'knex';

export function getFullTextSearchRankCalcSql(
    database: Knex,
    tableName: string,
    searchVectorColumnName: string,
    query: string,
    searchRankColumnName = 'search_rank',
) {
    const searchRankRawSql = database.raw(
        `ts_rank(${tableName}.${searchVectorColumnName}, websearch_to_tsquery('lightdash_english_config', ?), 0) as ${searchRankColumnName}`,
        [query],
    );

    return {
        searchRankRawSql,
        searchRankColumnName,
    };
}
