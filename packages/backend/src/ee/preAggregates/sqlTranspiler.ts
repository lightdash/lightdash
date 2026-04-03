import {
    AnyType,
    assertUnreachable,
    getItemId,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import {
    Dialect,
    init,
    isInitialized,
    tokenize,
    transpile,
} from '@polyglot-sql/sdk';

export function getDialect(adapter: SupportedDbtAdapter): Dialect {
    switch (adapter) {
        case SupportedDbtAdapter.POSTGRES:
            return Dialect.PostgreSQL;
        case SupportedDbtAdapter.BIGQUERY:
            return Dialect.BigQuery;
        case SupportedDbtAdapter.SNOWFLAKE:
            return Dialect.Snowflake;
        case SupportedDbtAdapter.DATABRICKS:
            return Dialect.Databricks;
        case SupportedDbtAdapter.REDSHIFT:
            return Dialect.Redshift;
        case SupportedDbtAdapter.TRINO:
            return Dialect.Trino;
        case SupportedDbtAdapter.ATHENA:
            return Dialect.Athena;
        case SupportedDbtAdapter.DUCKDB:
            return Dialect.DuckDB;
        case SupportedDbtAdapter.CLICKHOUSE:
            return Dialect.ClickHouse;
        default:
            return assertUnreachable(
                adapter,
                `Unsupported adapter for SQL transpilation: ${adapter}`,
            );
    }
}

async function ensureInitialized(): Promise<void> {
    if (!isInitialized()) {
        await init();
    }
}

/**
 * Builds a column rename map for a table's sql_filter.
 * Maps original dimension names → flattened pre-aggregate column names.
 *
 * e.g. { status: 'orders_status', created_at: 'orders_created_at' }
 */
function buildColumnRenameMap(
    explore: Explore,
    tableName: string,
): Record<string, string> {
    const table = explore.tables[tableName];
    if (!table) return {};

    const renameMap: Record<string, string> = {};

    Object.values(table.dimensions).forEach((dimension) => {
        const flattenedName = getItemId({
            table: dimension.table,
            name: dimension.name,
        });
        if (dimension.name !== flattenedName) {
            renameMap[dimension.name] = flattenedName;
        }
    });

    return renameMap;
}

/**
 * Renames identifier tokens in SQL using the tokenizer.
 * This is safe because the tokenizer understands SQL structure —
 * identifiers inside string literals are not tokens.
 */
function renameColumnsViaTokenizer(
    sql: string,
    dialect: Dialect,
    renameMap: Record<string, string>,
): string {
    if (Object.keys(renameMap).length === 0) return sql;

    const tokenResult = tokenize(sql, dialect);
    if (!tokenResult.success || !tokenResult.tokens) return sql;

    const { tokens } = tokenResult;
    const getTokenType = (token: (typeof tokens)[number]): string =>
        // The SDK's token type is inconsistent
        (token as AnyType).token_type ?? token.tokenType;

    let result = '';
    let lastEnd = 0;

    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];

        // Preserve any text between tokens (whitespace, etc.)
        result += sql.substring(lastEnd, token.span.start);

        const tokenType = getTokenType(token);
        const isIdentifier =
            tokenType === 'VAR' || tokenType === 'QUOTED_IDENTIFIER';

        // Only rename identifiers in column position:
        // - After a DOT (table.COLUMN) → column
        // - Before a DOT (TABLE.column) → table qualifier, skip
        // - Standalone (no adjacent DOT) → column
        const prevType = i > 0 ? getTokenType(tokens[i - 1]) : null;
        const nextType =
            i < tokens.length - 1 ? getTokenType(tokens[i + 1]) : null;
        const isTableQualifier = nextType === 'DOT' && prevType !== 'DOT';
        const isColumnPosition = isIdentifier && !isTableQualifier;

        if (isColumnPosition && token.text in renameMap) {
            const renamed = renameMap[token.text];
            result +=
                tokenType === 'QUOTED_IDENTIFIER' ? `"${renamed}"` : renamed;
        } else {
            result += sql.substring(token.span.start, token.span.end);
        }

        lastEnd = token.span.end;
    }

    // Append any trailing text
    result += sql.substring(lastEnd);

    return result;
}

/**
 * Renames columns using the tokenizer, then transpiles the expression
 * from the source dialect to DuckDB.
 */
function transpileAndRenameExpression(
    expression: string,
    sourceDialect: Dialect,
    columnRenameMap: Record<string, string>,
): string {
    const wrapped = `SELECT 1 WHERE ${expression}`;

    // Step 1: Rename columns using tokenizer (AST-aware, safe for string literals)
    const renamed = renameColumnsViaTokenizer(
        wrapped,
        sourceDialect,
        columnRenameMap,
    );

    // Step 2: Transpile from source dialect to DuckDB
    const result = transpile(renamed, sourceDialect, Dialect.DuckDB);

    if (!result.success || !result.sql || result.sql.length === 0) {
        throw new Error(
            `Failed to transpile sql_filter expression: ${result.error ?? 'unknown error'}`,
        );
    }

    // Extract the WHERE clause back out
    const transpiled = result.sql[0];
    const whereMatch = transpiled.match(/WHERE\s+([\s\S]+)$/i);
    if (!whereMatch) {
        throw new Error(
            `Could not extract WHERE clause from transpiled SQL: ${transpiled}`,
        );
    }

    return whereMatch[1].trim();
}

// ---------------------------------------------------------------------------
// Placeholder protection
// ---------------------------------------------------------------------------

const PLACEHOLDER_REGEX =
    /\$\{(?:lightdash|ld)\.(?:attributes?|attr|user)\.[^}]+\}|\$\{TABLE\}|\$\{[^}]+\}/g;

function protectPlaceholders(sql: string): {
    protected: string;
    restore: (transpiled: string) => string;
} {
    const placeholders = new Map<string, string>();
    let counter = 0;

    const protectedSql = sql.replace(PLACEHOLDER_REGEX, (match) => {
        const sentinel = `__ld_placeholder_${counter}__`;
        counter += 1;
        placeholders.set(sentinel, match);
        return sentinel;
    });

    const restore = (transpiled: string): string => {
        let result = transpiled;
        for (const [sentinel, original] of placeholders) {
            result = result.replaceAll(sentinel, original);
        }
        return result;
    };

    return { protected: protectedSql, restore };
}

/**
 * Transpiles all sqlWhere expressions in an explore's tables from the
 * source warehouse dialect to DuckDB, and renames column references
 * to their flattened pre-aggregate column names.
 *
 * User attribute placeholders (${lightdash.attributes.X}) are temporarily
 * replaced with safe sentinel strings before transpilation, then restored.
 */
export async function transpileExploreSqlFilters(
    explore: Explore,
): Promise<Explore['tables']> {
    const sourceDialect = getDialect(explore.targetDatabase);

    // DuckDB → DuckDB: no transpilation needed
    if (sourceDialect === Dialect.DuckDB) {
        return explore.tables;
    }

    await ensureInitialized();

    return Object.fromEntries(
        Object.entries(explore.tables).map(([tableName, table]) => {
            if (!table.sqlWhere) {
                return [tableName, table];
            }

            const columnRenameMap = buildColumnRenameMap(explore, tableName);
            const { protected: protectedSql, restore } = protectPlaceholders(
                table.sqlWhere,
            );
            const transpiled = transpileAndRenameExpression(
                protectedSql,
                sourceDialect,
                columnRenameMap,
            );

            return [tableName, { ...table, sqlWhere: restore(transpiled) }];
        }),
    );
}
