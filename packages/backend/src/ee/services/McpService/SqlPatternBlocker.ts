/**
 * Sanitises a SQL string and tests it against a list of user-configured
 * regex patterns.  The sanitisation removes common evasion tricks
 * (comments, quoted identifiers) so that the patterns can be kept simple.
 *
 * The patterns themselves are opaque – callers decide what to block
 * (schema names, table names, keywords, etc.) and can anchor to
 * FROM/JOIN if they choose.
 */

/**
 * Strip SQL comments and quoting characters so that the raw text of
 * identifiers is exposed for pattern matching.
 *
 * 1. Remove multi-line comments  (/* … *​/)
 * 2. Remove single-line comments (-- …)
 * 3. Remove double-quotes, single-quotes and backticks
 * 4. Collapse whitespace and lowercase
 */
function sanitiseSql(sql: string): string {
    let s = sql;

    // 1. Multi-line comments (non-greedy)
    s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');

    // 2. Single-line comments
    s = s.replace(/--[^\n]*/g, ' ');

    // 3. Strip quoting characters so quoted identifiers can't bypass
    s = s.replace(/["'`]/g, '');

    // 4. Collapse whitespace & lowercase
    s = s.replace(/\s+/g, ' ').trim().toLowerCase();

    return s;
}

/**
 * Returns `true` if the SQL matches any of the blocked patterns.
 *
 * @param sql       – the raw SQL query
 * @param patterns  – regex pattern strings (case-insensitive matching
 *                    is applied automatically when sanitise is true since
 *                    the SQL is lowercased)
 * @param sanitise  – when true (default), strip comments, quotes and
 *                    collapse whitespace before matching. Set to false if
 *                    you want patterns to match the raw SQL as-is.
 */
export function matchesBlockedPattern(
    sql: string,
    patterns: string[],
    sanitise: boolean = true,
): boolean {
    if (patterns.length === 0) return false;

    const target = sanitise ? sanitiseSql(sql) : sql;

    return patterns.some((pattern) => {
        const re = new RegExp(pattern, sanitise ? undefined : 'i');
        return re.test(target);
    });
}
