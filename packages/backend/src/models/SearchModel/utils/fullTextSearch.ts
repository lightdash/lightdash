import { Knex } from 'knex';

export function getFullTextSearchRankCalcSql(
    database: Knex,
    tableName: string,
    searchVectorColumnName: string,
    query: string,
) {
    return database.raw(
        `ROUND(
            ts_rank_cd(
                :searchVectorColumn:,
                websearch_to_tsquery('lightdash_english_config', :query),
                32
            )::numeric,
            6
        )::float`,
        {
            searchVectorColumn: `${tableName}.${searchVectorColumnName}`,
            query,
        },
    );
}
