import { CompiledField, CompiledTable } from '@lightdash/common';
import { Knex } from 'knex';
import { compact, escapeRegExp } from 'lodash';

// Exact/prefix name boosts sit above typical ts_rank_cd values (0–1) so a
// short exact title always outranks longer partial matches.
const EXACT_NAME_RANK_BOOST = 100;
const PREFIX_NAME_RANK_BOOST = 50;

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
        .map((word) => {
            // Remove or escape characters that cause issues with PostgreSQL text search
            const sanitized = word
                .replace(/'/g, "''") // escape single quotes
                .replace(/[?&|!()]/g, '') // remove problematic tsquery operators
                .replace(/:/g, ''); // remove colon which has special meaning in tsquery
            return sanitized ? `'${sanitized}':*` : '';
        })
        .filter((word) => word.length > 0) // remove empty results after sanitization
        .join(operator);
}

function getNameMatchBoostSql(): string {
    return `CASE
            WHEN lower(:nameColumn:) = lower(:rawSearchQuery) THEN ${EXACT_NAME_RANK_BOOST}
            WHEN lower(:nameColumn:) LIKE lower(:rawSearchQuery) || '%' THEN ${PREFIX_NAME_RANK_BOOST}
            ELSE 0
        END`;
}

export function getFullTextSearchRankCalcSql({
    database,
    variables,
    fullTextSearchOperator = 'AND',
    nameColumn,
}: {
    database: Knex;
    variables: Record<string, string>;
    fullTextSearchOperator?: 'OR' | 'AND';
    nameColumn?: string;
}) {
    const updatedVariables = {
        ...variables,
        searchQuery: getFullTextSearchQuery(
            variables.searchQuery,
            fullTextSearchOperator,
        ),
        ...(nameColumn
            ? {
                  nameColumn,
                  rawSearchQuery: variables.searchQuery,
              }
            : {}),
    };

    const tsRankSql = `ROUND(
            ts_rank_cd(
                :searchVectorColumn:,
                to_tsquery('lightdash_english_config', :searchQuery),
                32
            )::numeric,
            6
        )::float`;

    if (!nameColumn) {
        return database.raw(tsRankSql, updatedVariables);
    }

    return database.raw(
        `(${tsRankSql} + ${getNameMatchBoostSql()})`,
        updatedVariables,
    );
}

/**
 * Returns a raw SQL condition that uses the GIN index on search_vector.
 * This should be used in a WHERE clause BEFORE computing ts_rank_cd to
 * filter rows using the index, dramatically reducing the number of rows
 * that need rank computation.
 */
export function getFullTextSearchFilterSql({
    database,
    searchVectorColumn,
    searchQuery,
    fullTextSearchOperator = 'AND',
}: {
    database: Knex;
    searchVectorColumn: string;
    searchQuery: string;
    fullTextSearchOperator?: 'OR' | 'AND';
}) {
    const formattedQuery = getFullTextSearchQuery(
        searchQuery,
        fullTextSearchOperator,
    );

    return database.raw(
        `:searchVectorColumn: @@ to_tsquery('lightdash_english_config', :searchQuery)`,
        {
            searchVectorColumn,
            searchQuery: formattedQuery,
        },
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
    nameColumn,
}: {
    database: Knex;
    variables: Record<string, string>;
    nameColumn?: string;
}) {
    const webSearchQuery = getWebSearchQuery(variables.searchQuery);
    const bindings = {
        ...variables,
        searchQuery: webSearchQuery,
        ...(nameColumn
            ? {
                  nameColumn,
                  rawSearchQuery: variables.searchQuery,
              }
            : {}),
    };

    const tsRankSql = `ROUND(
            ts_rank_cd(
                :searchVectorColumn:,
                websearch_to_tsquery('lightdash_english_config', :searchQuery),
                32
            )::numeric,
            6
        )::float`;

    if (!nameColumn) {
        return database.raw(tsRankSql, bindings);
    }

    return database.raw(`(${tsRankSql} + ${getNameMatchBoostSql()})`, bindings);
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
    const nameMatches = tableOrField.name.match(regex) ?? [];
    const descriptionMatches = tableOrField.description?.match(regex) ?? [];

    // remove duplicate matches
    return new Set([...labelMatches, ...nameMatches, ...descriptionMatches])
        .size;
}

/**
 * Prefer exact and prefix label matches over partial word-count matches so a
 * short exact title ranks above longer names that merely repeat the query words.
 */
export function getExactOrPrefixLabelScore(
    query: string,
    label: string,
): number {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedLabel = label.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
        return 0;
    }
    if (normalizedLabel === normalizedQuery) {
        return 2;
    }
    if (normalizedLabel.startsWith(normalizedQuery)) {
        return 1;
    }
    return 0;
}

/**
 * Verified matches are fetched through a dedicated capped query so they are
 * never crowded out of the per-type result caps by unverified matches.
 * Combined results are re-sorted by search_rank when present.
 */
export async function searchReservingVerified<
    T extends { uuid: string; search_rank?: number },
>(
    verifiedOnly: boolean,
    search: (opts: { verifiedOnly: boolean }) => Promise<T[]>,
): Promise<T[]> {
    if (verifiedOnly) {
        return search({ verifiedOnly: true });
    }

    const [allResults, verifiedResults] = await Promise.all([
        search({ verifiedOnly: false }),
        search({ verifiedOnly: true }),
    ]);

    const byUuid = new Map<string, T>();
    for (const result of allResults) {
        byUuid.set(result.uuid, result);
    }
    for (const result of verifiedResults) {
        if (!byUuid.has(result.uuid)) {
            byUuid.set(result.uuid, result);
        }
    }

    return [...byUuid.values()].sort(
        (a, b) => (b.search_rank ?? 0) - (a.search_rank ?? 0),
    );
}
