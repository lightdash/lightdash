import { CompiledField, CompiledTable } from '@lightdash/common';
import { Knex } from 'knex';
import { compact, escapeRegExp } from 'lodash';

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

export function getRegexFromUserQuery(query: string) {
    const sanitizedQuery = escapeRegExp(query);
    const splitQuery = compact(Array.from(new Set(sanitizedQuery.split(' '))));

    return new RegExp(splitQuery.join('|'), 'ig');
}

export function getTableOrFieldMatchCount(
    regex: RegExp,
    tableOrField: CompiledTable | CompiledField,
) {
    const labelMatches = tableOrField.label.match(regex) ?? [];
    const descriptionMatches = tableOrField.description?.match(regex) ?? [];

    // remove duplicate matches
    return new Set([...labelMatches, ...descriptionMatches]).size;
}
