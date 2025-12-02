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

/**
 * Creates a regex pattern for user search that matches words at word boundaries.
 * This prevents partial substring matches (e.g., "Don" won't match "Brandon" or "Gordon").
 *
 * For single words: uses word boundary at start (\m) to match word prefixes
 * For multiple words: requires ALL words to match (AND logic) in at least one column
 *
 * Examples:
 * - "Don" matches: "Don", "Don Smith", "McDonald Don" (word boundary match)
 * - "Don" won't match: "Brandon", "Gordon", "McDonald" (no word boundary)
 * - "Don Smith" matches only if BOTH "Don" AND "Smith" appear in at least one column
 */
export function getColumnMatchRegexQuery(
    queryBuilder: Knex.QueryBuilder,
    searchQuery: string,
    columns: string[],
) {
    const words = searchQuery
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .map((word) => escapeRegExp(word));

    if (words.length === 0) {
        return queryBuilder;
    }

    // For each word, require it to match at least one column at a word boundary
    return queryBuilder.where((builder) => {
        words.forEach((word) => {
            // Use \m for word boundary at start (PostgreSQL regex)
            // This makes "Don" match "Don" or "Don Smith" but not "Brandon"
            const regex = `\\m${word}`;

            builder.andWhere((subBuilder) => {
                columns.forEach((column) =>
                    subBuilder.orWhereRaw(`${column} ~* ?`, [regex]),
                );
            });
        });
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
