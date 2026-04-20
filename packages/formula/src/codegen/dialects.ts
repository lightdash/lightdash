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

export const DIALECTS: Record<Dialect, DialectConfig> = {
    postgres: POSTGRES_LIKE_CONFIG,
    redshift: POSTGRES_LIKE_CONFIG,
    bigquery: BIGQUERY_CONFIG,
    snowflake: SNOWFLAKE_CONFIG,
    duckdb: DUCKDB_CONFIG,
};
