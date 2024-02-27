import { Knex } from 'knex';

export const SEARCH_RANK_COLUMN_NAME = 'search_rank';

export function getFullTextSearchRankCalcSql(
    database: Knex,
    tableName: string,
    searchVectorColumnName: string,
    query: string,
) {
    return database.raw(
        `ROUND(
            ts_rank_cd(
                ${tableName}.${searchVectorColumnName},
                websearch_to_tsquery('lightdash_english_config', ?),
                32
            )::numeric,
            6
        )::float as ${SEARCH_RANK_COLUMN_NAME}`,
        [query],
    );
}
