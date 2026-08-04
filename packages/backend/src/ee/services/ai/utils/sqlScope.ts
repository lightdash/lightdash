/**
 * Restricts which part of the warehouse the AI agent may read.
 *
 * This is a correctness control, not a security boundary. `runSql` already
 * requires the prompting user to hold `manage SqlRunner`, so anything the
 * agent can reach the user can reach through the SQL Runner anyway — a gap
 * here grants nobody anything they did not already have. What it buys is
 * keeping the agent off schemas the customer knows are wrong to answer from
 * (a retired dbt project, another team's models, a raw landing zone).
 *
 * Enforcement is lexical rather than a full parse, because a real parser
 * would need to cover nine warehouse dialects. The rules below are chosen so
 * that anything the lexer cannot confidently classify is rejected rather than
 * allowed.
 */

// Comments and single-quoted literals are blanked before any analysis, so a
// schema merely *named* in a comment or a string can't trip the guard. Kept
// byte-identical to the equivalent in runSql.ts.
const SQL_COMMENTS_AND_STRINGS = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g;

// Identifiers that may legitimately follow FROM/JOIN without naming a table.
const NON_TABLE_KEYWORDS = new Set([
    'lateral',
    'unnest',
    'only',
    'table',
    'values',
]);

// `<name> AS (` — CTE definitions. Also matches WINDOW definitions, which is
// harmless: a window name is never used as a table reference.
const CTE_DEFINITION = /\b([a-zA-Z_][\w$]*)\s+AS\s*\(/gi;

// FROM/JOIN followed by an identifier chain. The trailing `(` capture
// distinguishes a table function (`FROM generate_series(...)`) from a table.
const TABLE_REFERENCE = /\b(FROM|JOIN)\s+([\w$."`[\]]+)\s*(\()?/gi;

// Keywords that end the FROM clause's table list.
const FROM_CLAUSE_TERMINATOR =
    /^(WHERE|GROUP|ORDER|HAVING|LIMIT|WINDOW|QUALIFY|UNION|INTERSECT|EXCEPT|JOIN|LEFT|RIGHT|INNER|FULL|CROSS|ON|USING)$/i;

export type SqlScope = {
    /** Schemas the agent may read. Empty means unrestricted. */
    schemas: string[];
    /** Catalogs/databases the agent may read. Empty means any catalog. */
    catalogs?: string[];
};

export type SqlScopeViolation =
    | { kind: 'unqualified'; reference: string }
    | { kind: 'comma_join'; reference: string }
    | { kind: 'unparseable'; reference: string }
    | { kind: 'schema'; reference: string; schema: string }
    | { kind: 'catalog'; reference: string; catalog: string };

const unquote = (part: string) =>
    part.replace(/^["`[]|["`\]]$/g, '').toLowerCase();

const lowerSet = (values: string[] | undefined) =>
    values?.length ? new Set(values.map((v) => v.toLowerCase())) : null;

export const isSqlScopeConfigured = (scope: SqlScope | null | undefined) =>
    !!scope && scope.schemas.length > 0;

/**
 * Whether a schema (optionally in a given catalog) is readable by the agent.
 * Used by the discovery tools, which know the schema directly and so need no
 * lexical analysis.
 */
export const isSchemaInScope = (
    scope: SqlScope | null | undefined,
    schema: string,
    catalog?: string,
): boolean => {
    if (!isSqlScopeConfigured(scope)) return true;

    const catalogs = lowerSet(scope!.catalogs);
    if (
        catalog !== undefined &&
        catalogs &&
        !catalogs.has(catalog.toLowerCase())
    )
        return false;

    return new Set(scope!.schemas.map((s) => s.toLowerCase())).has(
        schema.toLowerCase(),
    );
};

/**
 * A comma at paren-depth zero inside a FROM clause is a legacy implicit join.
 * We reject rather than resolve it: the operands after the comma are easy to
 * miss lexically, so failing closed is the safe posture. Explicit JOIN is what
 * the system prompt asks the agent for anyway.
 */
const hasTopLevelCommaInFromClause = (
    sql: string,
    startIndex: number,
): boolean => {
    let depth = 0;
    let word = '';

    for (let i = startIndex; i < sql.length; i += 1) {
        const ch = sql[i];

        if (/[\w$]/.test(ch)) {
            word += ch;
        } else {
            if (depth === 0 && word && FROM_CLAUSE_TERMINATOR.test(word))
                return false;
            word = '';

            if (ch === '(') depth += 1;
            else if (ch === ')') {
                // Closing the subquery that contains this FROM — clause is over.
                if (depth === 0) return false;
                depth -= 1;
            } else if (ch === ';') return false;
            else if (ch === ',' && depth === 0) return true;
        }
    }

    return false;
};

export const findSqlScopeViolations = (
    sql: string,
    scope: SqlScope | null | undefined,
): SqlScopeViolation[] => {
    if (!isSqlScopeConfigured(scope)) return [];

    const stripped = sql.replace(SQL_COMMENTS_AND_STRINGS, ' ');

    const cteNames = new Set(
        [...stripped.matchAll(CTE_DEFINITION)].map((m) => m[1].toLowerCase()),
    );
    const allowedSchemas = new Set(scope!.schemas.map((s) => s.toLowerCase()));
    const allowedCatalogs = lowerSet(scope!.catalogs);

    const classify = (match: RegExpMatchArray): SqlScopeViolation | null => {
        const [full, keyword, reference, isFunctionCall] = match;
        if (isFunctionCall) return null;

        if (
            keyword.toUpperCase() === 'FROM' &&
            hasTopLevelCommaInFromClause(
                stripped,
                (match.index ?? 0) + full.length,
            )
        ) {
            return { kind: 'comma_join', reference };
        }

        const parts = reference
            .split('.')
            .filter((p) => p !== '')
            .map(unquote);

        if (parts.length === 1) {
            const [name] = parts;
            if (cteNames.has(name) || NON_TABLE_KEYWORDS.has(name)) return null;
            return { kind: 'unqualified', reference };
        }
        if (parts.length === 2) {
            const [schema] = parts;
            return allowedSchemas.has(schema)
                ? null
                : { kind: 'schema', reference, schema };
        }
        if (parts.length === 3) {
            const [catalog, schema] = parts;
            if (allowedCatalogs && !allowedCatalogs.has(catalog)) {
                return { kind: 'catalog', reference, catalog };
            }
            return allowedSchemas.has(schema)
                ? null
                : { kind: 'schema', reference, schema };
        }
        return { kind: 'unparseable', reference };
    };

    return [...stripped.matchAll(TABLE_REFERENCE)]
        .map(classify)
        .filter((v): v is SqlScopeViolation => v !== null);
};

const describeViolation = (violation: SqlScopeViolation): string => {
    switch (violation.kind) {
        case 'schema':
            return `- \`${violation.reference}\` reads from schema \`${violation.schema}\`, which is not in scope.`;
        case 'catalog':
            return `- \`${violation.reference}\` reads from catalog \`${violation.catalog}\`, which is not in scope.`;
        case 'unqualified':
            return `- \`${violation.reference}\` is not schema-qualified. Qualify every table with its schema.`;
        case 'comma_join':
            return `- \`${violation.reference}\` uses comma-join syntax. Use explicit JOIN instead.`;
        case 'unparseable':
            return `- \`${violation.reference}\` could not be resolved to a schema-qualified table.`;
        default:
            return `- \`${(violation as SqlScopeViolation).reference}\` is not allowed.`;
    }
};

export const formatSqlScopeError = (
    violations: SqlScopeViolation[],
    scope: SqlScope,
): string =>
    [
        "This query was blocked because it reads outside this project's allowed data scope.",
        ...violations.map(describeViolation),
        `Allowed schemas: ${scope.schemas.join(', ')}.`,
        ...(scope.catalogs?.length
            ? [`Allowed catalogs: ${scope.catalogs.join(', ')}.`]
            : []),
        'Rewrite the query against an allowed schema. Do NOT retry this query, and do NOT substitute a different table without telling the user — if the data you need is not in an allowed schema, say so plainly.',
    ].join('\n');
