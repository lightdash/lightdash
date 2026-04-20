import type { Dialect, StringLiteralNode } from '../types';

// Per-dialect SQL emission overrides. Any field that's unset uses the
// ANSI-standard default implemented directly in SqlGenerator (see
// generator.ts). Adding a new warehouse = a single record in DIALECTS below.
// No new files, no subclasses, no factory updates.
//
// Keep the surface minimal: only add a field here the first time a real
// dialect actually diverges. The escape-hatch philosophy is "pay for what
// you use" — we don't preempt divergences that haven't happened yet.
export interface DialectConfig {
    quoteIdentifier: (name: string) => string;
    generateStringLiteral?: (node: StringLiteralNode) => string;
    generateModulo?: (left: string, right: string) => string;
    // Dialect-specific transform for the value argument of LAG/LEAD. Needed
    // for ClickHouse, which returns the type-default (0 for numbers, empty
    // string, etc.) instead of NULL at partition boundaries unless the
    // argument is Nullable. Other dialects leave this unset and follow
    // ANSI LAG/LEAD semantics without help.
    wrapLagLeadArg?: (arg: string) => string;
    // Override the SQL function name emitted for LAG / LEAD. ClickHouse
    // needs `lagInFrame` / `leadInFrame`, which work against the user's
    // ORDER BY correctly; the plain `LAG`/`LEAD` silently use the default
    // RANGE frame that excludes future rows, making `LEAD` return NULL
    // everywhere. Other dialects leave these unset and use the ANSI names.
    lagFunctionName?: string;
    leadFunctionName?: string;
    // Explicit frame clause attached to LAG/LEAD. ClickHouse's default
    // frame is `ROWS UNBOUNDED PRECEDING` which excludes future rows, so
    // `leadInFrame` returns NULL for every row. Setting an explicit
    // `UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` frame lets LEAD see
    // future rows. Other dialects leave this unset and rely on the ANSI
    // default frame.
    lagLeadFrameClause?: string;
}

// --- Shared emitters ---

const doubleQuoteIdentifier = (name: string): string =>
    `"${name.replace(/"/g, '""')}"`;

// Backslash-style string escaping, used by Spark/BigQuery-family engines
// where `''` opens a second string literal rather than escaping a quote.
const backslashEscapedStringLiteral = (node: StringLiteralNode): string => {
    const escaped = node.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${escaped}'`;
};

// ANSI-doubled single quotes for quote-escape PLUS backslash-escape for
// backslashes. Used by engines (ClickHouse) whose string parser interprets
// both conventions — doubling alone silently loses backslashes because
// ClickHouse unescapes `\\` to `\`. Matches the defensive approach in
// `ClickhouseSqlBuilder.escapeString` (packages/warehouses) so a single
// query produced by MetricQueryBuilder + the formula package has one
// consistent string-literal style.
const ansiQuoteWithEscapedBackslashesStringLiteral = (
    node: StringLiteralNode,
): string => {
    const escaped = node.value.replace(/\\/g, '\\\\').replace(/'/g, "''");
    return `'${escaped}'`;
};

const infixPercentModulo = (left: string, right: string): string =>
    `(${left} % ${right})`;

// --- Dialect configs ---

// Postgres and Redshift share identically: double-quoted identifiers, `%`
// modulo, doubled-quote string escaping, EXTRACT-style date parts, ANSI
// window-aggregate syntax. Redshift is effectively PostgreSQL 8.x with
// columnar storage — every SQL construct the formula package emits is
// valid on both. Defined once and referenced twice from DIALECTS.
const POSTGRES_LIKE_CONFIG: DialectConfig = {
    quoteIdentifier: doubleQuoteIdentifier,
    generateModulo: infixPercentModulo,
};

const SNOWFLAKE_CONFIG: DialectConfig = {
    quoteIdentifier: doubleQuoteIdentifier,
};

const DUCKDB_CONFIG: DialectConfig = {
    quoteIdentifier: doubleQuoteIdentifier,
    generateModulo: infixPercentModulo,
};

const BIGQUERY_CONFIG: DialectConfig = {
    // BigQuery identifiers escape inner backticks with a leading backslash
    // rather than Spark's doubled-backtick convention.
    quoteIdentifier: (name) => `\`${name.replace(/`/g, '\\`')}\``,
    generateStringLiteral: backslashEscapedStringLiteral,
    // BigQuery's MOD() requires matching numeric types, so both operands are
    // explicitly cast to NUMERIC.
    generateModulo: (left, right) =>
        `MOD(CAST(${left} AS NUMERIC), CAST(${right} AS NUMERIC))`,
};

const DATABRICKS_CONFIG: DialectConfig = {
    // Databricks runs Spark SQL. Identifier backticks are escaped by
    // doubling (Hive/Spark convention: `a``b` → the identifier `a`b`),
    // which differs from BigQuery's backslash escaping.
    quoteIdentifier: (name) => `\`${name.replace(/`/g, '``')}\``,
    // Spark SQL rejects doubled single quotes as a quote escape; uses the
    // same backslash style as BigQuery.
    generateStringLiteral: backslashEscapedStringLiteral,
    // `MOD(a, b)` (the ANSI default) is valid Spark SQL with no type casts.
};

const CLICKHOUSE_CONFIG: DialectConfig = {
    // ClickHouse accepts both backticks and double quotes for identifiers.
    // Use double quotes to match the convention in ClickhouseSqlBuilder
    // (packages/warehouses) — that way identifiers in a single query
    // produced by MetricQueryBuilder + the formula package all look alike.
    quoteIdentifier: doubleQuoteIdentifier,
    // ClickHouse `Decimal(10,2) % Int32` silently truncates to `0` (it
    // picks the Int side's scale, not the Decimal's). `Decimal % Decimal`
    // or `Float % *` preserves precision. Casting both operands to
    // `Float64` gives cross-type behaviour that matches every other
    // dialect, at the cost of an integer-only `a % b` returning a Float
    // (`0` → `0.0`) — the runner's tolerance comparison absorbs that.
    generateModulo: (left, right) =>
        `(toFloat64(${left}) % toFloat64(${right}))`,
    // Doubled single quotes for quote-escape AND backslash-on-backslash
    // — ClickHouse interprets both. Doubling alone silently halves any
    // backslashes in the value (ClickHouse unescapes `\\` to `\`). Same
    // approach as ClickhouseSqlBuilder.escapeString for consistency.
    generateStringLiteral: ansiQuoteWithEscapedBackslashesStringLiteral,
    // ClickHouse LAG/LEAD return the type default (e.g. 0 for numbers) at
    // partition boundaries unless the input is Nullable. Wrapping with
    // `toNullable()` makes the boundary rows return NULL like every other
    // dialect.
    wrapLagLeadArg: (arg) => `toNullable(${arg})`,
    // Use ClickHouse's purpose-built frame-aware variants. The plain
    // `LAG`/`LEAD` inherit the default RANGE frame (UNBOUNDED PRECEDING to
    // CURRENT ROW) which excludes future rows, silently breaking LEAD.
    lagFunctionName: 'lagInFrame',
    leadFunctionName: 'leadInFrame',
    lagLeadFrameClause:
        'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING',
};

export const DIALECTS: Record<Dialect, DialectConfig> = {
    postgres: POSTGRES_LIKE_CONFIG,
    redshift: POSTGRES_LIKE_CONFIG,
    bigquery: BIGQUERY_CONFIG,
    snowflake: SNOWFLAKE_CONFIG,
    duckdb: DUCKDB_CONFIG,
    databricks: DATABRICKS_CONFIG,
    clickhouse: CLICKHOUSE_CONFIG,
};
