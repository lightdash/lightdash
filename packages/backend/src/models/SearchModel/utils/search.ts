import { CompiledField, CompiledTable } from '@lightdash/common';
import { Knex } from 'knex';
import { compact, escapeRegExp } from 'lodash';

// To query multiple words with tsquery, we need to split the query and add `:*` to each word
export function getFullTextSearchQuery(
    searchQuery: string,
    fullTextSearchOperator: 'OR' | 'AND' = 'AND',
) {
    const operator = fullTextSearchOperator === 'OR' ? ' | ' : ' & ';
    return searchQuery
        .split(' ')
        .map((word) => word.trim())
        .filter((word) => word.length > 0)
        .filter((word, index, self) => self.indexOf(word) === index)
        .map((word) => `'${word.replace(/'/g, "''")}':*`) // wrap the word in quotes and escape existing quotes, this so that we can search with special charcters in the search query
        .join(operator);
}

export function getFullTextSearchRankCalcSql({
    database,
    variables,
    fullTextSearchOperator = 'AND',
}: {
    database: Knex;
    variables: Record<string, string>;
    fullTextSearchOperator?: 'OR' | 'AND';
}) {
    const updatedVariables = {
        ...variables,
        searchQuery: getFullTextSearchQuery(
            variables.searchQuery,
            fullTextSearchOperator,
        ),
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

/**
 * Converts a natural language query to OR-based websearch query.
 * For example: "average cost" becomes "average OR cost"
 * This makes searches more permissive for better recall.
 */
function getWebSearchQuery(searchQuery: string): string {
    // Split on spaces and join with OR for more permissive matching
    return searchQuery
        .split(' ')
        .filter((word) => word.trim())
        .join(' OR ');
}

/**
 * Web search variant that uses websearch_to_tsquery for natural language queries.
 * This is better suited for user-provided queries because:
 * - No special formatting required
 * - Handles phrases naturally with quotes
 * - Supports OR and NOT operators naturally
 * - Never raises syntax errors
 * - Uses OR by default for better recall (multiple words = any word matches)
 *
 * Use this for AI agent queries and user-facing search inputs.
 */
export function getWebSearchRankCalcSql({
    database,
    variables,
}: {
    database: Knex;
    variables: Record<string, string>;
}) {
    const webSearchQuery = getWebSearchQuery(variables.searchQuery);

    return database.raw(
        `ROUND(
            ts_rank_cd(
                :searchVectorColumn:,
                websearch_to_tsquery('lightdash_english_config', :searchQuery),
                32
            )::numeric,
            6
        )::float`,
        {
            ...variables,
            searchQuery: webSearchQuery,
        },
    );
}

export function getRegexFromUserQuery(query: string) {
    const sanitizedQuery = escapeRegExp(query);
    const splitQuery = compact(Array.from(new Set(sanitizedQuery.split(' '))));

    return new RegExp(splitQuery.join('|'), 'ig');
}

export function getColumnMatchRegexQuery(
    queryBuilder: Knex.QueryBuilder,
    searchQuery: string,
    columns: string[],
) {
    const regex = getRegexFromUserQuery(searchQuery).source;

    // use regexp_matches
    return queryBuilder.where((builder) => {
        columns.forEach((column) =>
            builder.orWhereRaw(`:column: ~* :regex`, { column, regex }),
        );
    });
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
