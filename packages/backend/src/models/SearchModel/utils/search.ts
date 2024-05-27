import { CompiledField, CompiledTable } from '@lightdash/common';
import { Knex } from 'knex';
import { compact, escapeRegExp } from 'lodash';

export function getFullTextSearchRankCalcSql({
    database,
    variables,
}: {
    database: Knex;
    variables: Record<string, string>;
}) {
    // To query multiple words with tsquery, we need to split the query and add `:*` to each word
    const updatedVariables = {
        ...variables,
        searchQuery: variables.searchQuery
            .split(' ')
            .map((word) => word.replace(/[^a-zA-Z0-9]/g, '').concat(':*'))
            .join(' | '),
    };

    return database.raw(
        `ROUND(
            ts_rank_cd(
                :searchVectorColumn:,
                to_tsquery('lightdash_english_config', :searchQuery),
                32
            )::numeric,
            6
        )::float`,
        updatedVariables,
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
