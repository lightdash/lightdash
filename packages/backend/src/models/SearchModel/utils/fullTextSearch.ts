import { Knex } from 'knex';

export function getFullTextSearchRankCalcSql(
    database: Knex,
    tableName: string,
    searchVectorColumnName: string,
    query: string,
    searchRankColumnName = 'search_rank',
) {
    const searchRankRawSql = database.raw(
        `ROUND(
            ts_rank_cd(
                ${tableName}.${searchVectorColumnName},
                websearch_to_tsquery('lightdash_english_config', ?),
                32
            )::numeric,
            6
        )::float as ${searchRankColumnName}`,
        [query],
    );

    return {
        searchRankRawSql,
        searchRankColumnName,
    };
}
