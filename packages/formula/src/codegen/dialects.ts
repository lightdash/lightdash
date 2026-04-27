import type { DateUnit, Dialect, StringLiteralNode, WeekDay } from '../types';

// Per-dialect SQL emission overrides. Every field is a full replacement for
// the ANSI default implemented in SqlGenerator (see generator.ts). Adding a
// new warehouse = one record in DIALECTS below — no subclasses, no factory
// updates.
//
// Design principle: each field is one cohesive emitter, not a flag / partial
// transform / string knob. If two concerns always move together (e.g. LAG's
// function name + its frame clause + its default-arg handling) they belong
// in one hook, not three. "Pay for what you use" applies at the emitter
// granularity — dialects only override the emitters they actually diverge
// on.
export interface DialectConfig {
    quoteIdentifier: (name: string) => string;
    generateStringLiteral?: (node: StringLiteralNode) => string;
    generateModulo?: (left: string, right: string) => string;
    generateConcat?: (args: string[]) => string;
    generateLagLead?: (ctx: LagLeadContext) => string;
    // AVG emission. Covers both the aggregate `=AVG(A)` and the windowed
    // `=MOVING_AVG(A, N, …)` (which fans out to `AVG(...) OVER (…)`).
    // Set for Postgres / Redshift to widen the argument to DOUBLE
    // PRECISION, matching `PostgresWarehouseClient.getMetricSql` (case
    // AVERAGE). Unset for BigQuery, Snowflake, DuckDB, Databricks, and
    // ClickHouse, whose production clients also defer to the base
    // `getDefaultMetricSql` that returns plain `AVG(arg)`.
    generateAvg?: (arg: string) => string;
    // ROUND emission. Set by Postgres-family configs to cast the value
    // to numeric in the 2-arg form. Unset elsewhere.
    generateRound?: (value: string, digits?: string) => string;
    // Override when the dialect has no `LAST_DAY(d)` or names it differently.
    generateLastDay?: (arg: string) => string;
    // DATE_TRUNC emission. Default (ANSI `DATE_TRUNC('unit', d)` with
    // INTERVAL-based offset for non-Monday week start) serves Postgres,
    // Redshift, Snowflake, DuckDB. BigQuery flips arg order and uses
    // WEEK(<DAY>); Databricks uses DATEADD for week offset; ClickHouse uses
    // `toStartOfXxx` helpers. `weekStartDay` is 0 (Monday) — 6 (Sunday).
    generateDateTrunc?: (
        unit: DateUnit,
        arg: string,
        weekStartDay: WeekDay,
    ) => string;
    // DATE_ADD emission. Default (Postgres/Redshift/DuckDB) is
    // `(d + (n) * INTERVAL '1 <unit>')`. BigQuery uses `DATE_ADD(d, INTERVAL
    // n UNIT)`, Snowflake uses `DATEADD(UNIT, n, d)`, Databricks fans out to
    // `date_add` / `add_months`, ClickHouse uses `addDays` / `addMonths`…
    // DATE_SUB is desugared to DATE_ADD with negated n at parse time, so
    // dialects only need to implement DATE_ADD.
    generateDateAdd?: (unit: DateUnit, date: string, n: string) => string;
}

// Everything a dialect needs to emit `LAG(...) OVER (...)` or
// `LEAD(...) OVER (...)` without owning the windowing boilerplate.
//
// `sqlFunc` is the ANSI name ('LAG' | 'LEAD') — dialects that need a
// different SQL-level function (ClickHouse's `lagInFrame`) swap it when
// they call `emitWindow`.
//
// `args` is the already-generated SQL strings for the user's arguments:
// `[value]`, `[value, offset]`, or `[value, offset, default]`.
//
// `emitWindow(sqlFunc, funcArgs, frameClause?)` produces the full
// `sqlFunc(funcArgs) OVER (…)` string with the current node's PARTITION BY
// / ORDER BY already attached. This keeps the window-clause machinery out
// of the dialect and lets the dialect focus on argument shape + frame.
interface LagLeadContext {
    sqlFunc: 'LAG' | 'LEAD';
    args: string[];
    emitWindow: (
        sqlFunc: string,
        funcArgs: string[],
        frameClause?: string,
    ) => string;
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
// backslashes. Required for engines whose string parser interprets both
// conventions — ClickHouse unescapes `\\` → `\`, and Redshift interprets
// `\'` as an escaped quote even with `standard_conforming_strings` on
// (letting a user value like `\';DROP TABLE …` break out of the literal).
// Doubling alone is unsafe on those engines. Matches the defensive
// approach in `ClickhouseSqlBuilder.escapeString` (packages/warehouses).
const ansiQuoteWithEscapedBackslashesStringLiteral = (
    node: StringLiteralNode,
): string => {
    const escaped = node.value.replace(/\\/g, '\\\\').replace(/'/g, "''");
    return `'${escaped}'`;
};

const infixPercentModulo = (left: string, right: string): string =>
    `(${left} % ${right})`;

// --- Dialect configs ---

// Shared Postgres-family emitters. These match, byte-for-byte, the
// behaviour of `PostgresWarehouseClient` in `packages/warehouses` so that
// a formula-mode table calculation and a metric-level expression over the
// same column produce SQL with identical runtime semantics on any
// Postgres-compatible warehouse (Postgres, Redshift). If you change one,
// change the other — the two live in separate packages on purpose (formula
// is intentionally zero-runtime-dep and does not import `@lightdash/common`)
// but they MUST stay in sync. See also `packages/warehouses/src/
// warehouseClients/PostgresWarehouseClient.ts`.
//
// AVG: widened to DOUBLE PRECISION so the division inside AVG never
// truncates to the input DECIMAL scale. On Redshift that truncation
// silently drops the fractional part (650/3 → 216.66 instead of
// 216.666…); on Postgres it's a no-op. Matches
// `PostgresWarehouseClient.getMetricSql` case AVERAGE.
const postgresStyleAvg = (arg: string): string =>
    `AVG(${arg}::DOUBLE PRECISION)`;
// CONCAT: infix `||` rather than variadic `CONCAT(...)`. Sidesteps
// Redshift's two-argument CONCAT limit and its strict overload resolution
// against untyped `'literal'` values in one stroke, and matches Postgres's
// native concatenation operator exactly. Matches
// `PostgresWarehouseClient.concatString`.
// NOTE: `||` is NULL-propagating (`a || NULL || b` is NULL), whereas
// `CONCAT(a, NULL, b)` returns `ab`. This matches production behaviour on
// Postgres-family warehouses; callers wanting NULL-ignoring concatenation
// should COALESCE the inputs at the call site.
const postgresStyleConcat = (args: string[]): string =>
    `(${args.join(' || ')})`;
// ROUND: cast value to numeric for the 2-arg form. Postgres and Redshift
// only define `round(numeric, int)`; `round(double precision, int)` does
// not exist. Any 2-arg ROUND over a Lightdash AVG metric (which
// PostgresWarehouseClient casts to DOUBLE PRECISION) would otherwise
// fail with "function round(double precision, integer) does not exist".
// The 1-arg form accepts either numeric or double precision natively, so
// we leave it alone to avoid an unnecessary cast.
const postgresStyleRound = (value: string, digits?: string): string =>
    digits !== undefined
        ? `ROUND((${value})::numeric, ${digits})`
        : `ROUND(${value})`;
// ANSI DATE_TRUNC — shared by Postgres/Redshift/Snowflake/DuckDB. Non-Monday
// week handling composes in the INTERVAL form; see `defaultDateTrunc` in
// generator.ts for the offset dance.
const postgresStyleDateTrunc = (unit: DateUnit, arg: string): string =>
    `DATE_TRUNC('${unit}', ${arg})`;

// Cast back to DATE so downstream ops see the same type as native `LAST_DAY`
// on warehouses that have it.
const postgresStyleLastDay = (arg: string): string =>
    `CAST(${postgresStyleDateTrunc(
        'month',
        arg,
    )} + INTERVAL '1 month' - INTERVAL '1 day' AS DATE)`;

const POSTGRES_CONFIG: DialectConfig = {
    quoteIdentifier: doubleQuoteIdentifier,
    generateModulo: infixPercentModulo,
    generateAvg: postgresStyleAvg,
    generateConcat: postgresStyleConcat,
    generateRound: postgresStyleRound,
    generateLastDay: postgresStyleLastDay,
    // DATE_TRUNC defaults to the ANSI form; leave `generateDateTrunc` unset
    // so `defaultDateTrunc` in generator.ts handles both base + non-Monday
    // week offset.
};

// Redshift is Postgres-wire-compatible and inherits every Postgres-family
// emitter above (AVG double-precision cast, `||` concatenation, `%`
// modulo, double-quoted identifiers). It adds four divergences:
//   1. String literals — `\'` escapes the quote in Redshift even with
//      `standard_conforming_strings` on, so the naive doubled-quote
//      escape Postgres gets away with would let a user value containing
//      `\';DROP TABLE …` break out of its literal. Uses the same
//      backslash-also-escaped approach as
//      `PostgresWarehouseClient.escapeString` (which `RedshiftSqlBuilder`
//      inherits — the production client has been applying this defence
//      on Redshift for years).
//   2. LAG / LEAD — Redshift rejects the 3-arg `(col, offset, default)`
//      form with "Default parameter not be supported for window function
//      lag". Wrapping `LAG(col, offset)` in COALESCE preserves the
//      surface behaviour without the 3-arg call.
//   3. DATE_ADD — Redshift rejects `date + INTERVAL '1 month'` with
//      "Interval values with month or year parts are not supported". Only
//      day-precision intervals are allowed on date columns. `DATEADD(unit,
//      n, d)` (same shape as Snowflake) works for every unit.
//   4. LAST_DAY — Redshift has a native `LAST_DAY(date)` function, so the
//      Postgres-style DATE_TRUNC + INTERVAL '1 month' composition (which
//      would trip divergence #3 anyway) isn't needed.
const REDSHIFT_CONFIG: DialectConfig = {
    ...POSTGRES_CONFIG,
    generateStringLiteral: ansiQuoteWithEscapedBackslashesStringLiteral,
    generateLagLead: ({ sqlFunc, args, emitWindow }) => {
        if (args.length >= 3) {
            const [value, offset, defaultValue] = args;
            return `COALESCE(${emitWindow(sqlFunc, [
                value,
                offset,
            ])}, ${defaultValue})`;
        }
        return emitWindow(sqlFunc, args);
    },
    generateLastDay: (arg) => `LAST_DAY(${arg})`,
    generateDateAdd: (unit, date, n) =>
        `DATEADD(${SQL_DATE_UNIT_IDENTIFIERS[unit]}, ${n}, ${date})`,
};

// Snowflake's `DATEADD(unit, n, d)` takes a bare unit identifier and is the
// idiomatic form — plain `d + INTERVAL '1 month'` is rejected for date
// columns. Unit names line up with BigQuery's bare identifiers.
const SNOWFLAKE_CONFIG: DialectConfig = {
    quoteIdentifier: doubleQuoteIdentifier,
    generateDateAdd: (unit, date, n) =>
        `DATEADD(${SQL_DATE_UNIT_IDENTIFIERS[unit]}, ${n}, ${date})`,
};

const DUCKDB_CONFIG: DialectConfig = {
    quoteIdentifier: doubleQuoteIdentifier,
    generateModulo: infixPercentModulo,
    // DuckDB's production client (`DuckdbWarehouseClient.concatString`)
    // uses the same `(a || b || c)` infix form as the Postgres family,
    // so share the emitter. Keeps formula-package and warehouse-package
    // SQL byte-identical on DuckDB.
    generateConcat: postgresStyleConcat,
};

// SQL bare-identifier names for DateUnit, shared by any dialect that takes
// unit as an identifier rather than a string (BigQuery, Snowflake). BigQuery
// flips `DATE_TRUNC` arg order + parameterises weeks via `WEEK(<DAY_NAME>)`.
// Mirrors `bigqueryConfig.getSqlForTruncatedDate` in
// `packages/common/src/utils/timeFrames.ts`.
const SQL_DATE_UNIT_IDENTIFIERS: Record<DateUnit, string> = {
    day: 'DAY',
    week: 'WEEK',
    month: 'MONTH',
    quarter: 'QUARTER',
    year: 'YEAR',
};
const BIGQUERY_WEEK_DAY_NAMES: Record<WeekDay, string> = {
    0: 'MONDAY',
    1: 'TUESDAY',
    2: 'WEDNESDAY',
    3: 'THURSDAY',
    4: 'FRIDAY',
    5: 'SATURDAY',
    6: 'SUNDAY',
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
    generateDateTrunc: (unit, arg, weekStartDay) => {
        if (unit === 'week') {
            return `DATE_TRUNC(${arg}, WEEK(${BIGQUERY_WEEK_DAY_NAMES[weekStartDay]}))`;
        }
        return `DATE_TRUNC(${arg}, ${SQL_DATE_UNIT_IDENTIFIERS[unit]})`;
    },
    generateDateAdd: (unit, date, n) =>
        `DATE_ADD(${date}, INTERVAL ${n} ${SQL_DATE_UNIT_IDENTIFIERS[unit]})`,
};

// Databricks (Spark SQL) has no general `DATEADD(unit, …)` across versions,
// so each unit fans out to a native helper: `date_add` for day/week,
// `add_months` for month/quarter/year. Week/quarter/year are scaled multiples
// of the base helper to avoid depending on newer `dateadd` availability.
const DATABRICKS_DATE_ADD: Record<DateUnit, (d: string, n: string) => string> =
    {
        day: (d, n) => `DATE_ADD(${d}, ${n})`,
        week: (d, n) => `DATE_ADD(${d}, (${n}) * 7)`,
        month: (d, n) => `ADD_MONTHS(${d}, ${n})`,
        quarter: (d, n) => `ADD_MONTHS(${d}, (${n}) * 3)`,
        year: (d, n) => `ADD_MONTHS(${d}, (${n}) * 12)`,
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
    // DATE_TRUNC in Spark SQL matches the ANSI form for all units; non-Monday
    // week start uses DATEADD-based offset because Spark has no INTERVAL
    // literal with a day count variable. Mirrors `databricksConfig.
    // getSqlForTruncatedDate` in timeFrames.ts.
    generateDateTrunc: (unit, arg, weekStartDay) => {
        if (unit === 'week' && weekStartDay !== 0) {
            return `DATEADD(DAY, ${weekStartDay}, DATE_TRUNC('week', DATEADD(DAY, -${weekStartDay}, ${arg})))`;
        }
        return `DATE_TRUNC('${unit}', ${arg})`;
    },
    generateDateAdd: (unit, date, n) => DATABRICKS_DATE_ADD[unit](date, n),
};

// ClickHouse has four dialect quirks the formula package cares about:
//   1. Identifier quoting — ClickHouse accepts both backticks and double
//      quotes. Use double quotes to match `ClickhouseSqlBuilder` so every
//      identifier in a query produced by MetricQueryBuilder + the formula
//      package looks alike.
//   2. String literals — doubling quotes alone silently halves backslashes
//      because ClickHouse unescapes `\\` → `\`. Matches the quote-double
//      + backslash-escape used by `ClickhouseSqlBuilder.escapeString`.
//   3. `Decimal(10,2) % Int32` silently truncates to `0` — ClickHouse
//      picks the Int side's scale. Casting both operands to `Float64`
//      preserves precision and matches every other dialect (integer
//      modulo returns Float, absorbed by the runner's tolerance).
//   4. LAG / LEAD — the bare names inherit the default RANGE frame
//      (UNBOUNDED PRECEDING..CURRENT ROW) which excludes future rows, so
//      `LEAD` returns NULL for every row. The `lagInFrame` / `leadInFrame`
//      variants work against the user's ORDER BY once given an explicit
//      `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` frame.
//      Additionally, ClickHouse returns type-default (e.g. 0 for numbers)
//      at partition boundaries instead of NULL unless the value arg is
//      wrapped with `toNullable()`.
// ClickHouse prefers the `toStartOf<Unit>` family for truncation; `DATE_TRUNC`
// exists but uses string unit parsing and is less consistent across versions.
// Mirrors `clickhouseConfig.getSqlForTruncatedDate` in timeFrames.ts.
const CLICKHOUSE_START_OF: Record<DateUnit, string> = {
    day: 'toStartOfDay',
    week: 'toStartOfWeek',
    month: 'toStartOfMonth',
    quarter: 'toStartOfQuarter',
    year: 'toStartOfYear',
};

// ClickHouse has dedicated `add<Unit>s` helpers per unit.
const CLICKHOUSE_ADD: Record<DateUnit, string> = {
    day: 'addDays',
    week: 'addWeeks',
    month: 'addMonths',
    quarter: 'addQuarters',
    year: 'addYears',
};

const CLICKHOUSE_CONFIG: DialectConfig = {
    quoteIdentifier: doubleQuoteIdentifier,
    generateStringLiteral: ansiQuoteWithEscapedBackslashesStringLiteral,
    generateModulo: (left, right) =>
        `(toFloat64(${left}) % toFloat64(${right}))`,
    generateLastDay: (arg) => `toLastDayOfMonth(${arg})`,
    generateDateTrunc: (unit, arg, weekStartDay) => {
        if (unit === 'week') {
            // `toStartOfWeek(x, mode)`: mode 1 = Monday-start (ISO). Non-Monday
            // week starts compose via shift-in / shift-out around the Monday
            // anchor.
            if (weekStartDay === 0) {
                return `toStartOfWeek(${arg}, 1)`;
            }
            return `addDays(toStartOfWeek(addDays(${arg}, -${weekStartDay}), 1), ${weekStartDay})`;
        }
        return `${CLICKHOUSE_START_OF[unit]}(${arg})`;
    },
    generateDateAdd: (unit, date, n) =>
        `${CLICKHOUSE_ADD[unit]}(${date}, ${n})`,
    generateLagLead: ({ sqlFunc, args, emitWindow }) => {
        const chFunc = sqlFunc === 'LAG' ? 'lagInFrame' : 'leadInFrame';
        const [value, ...rest] = args;
        const wrapped = [`toNullable(${value})`, ...rest];
        return emitWindow(
            chFunc,
            wrapped,
            'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING',
        );
    },
};

export const DIALECTS: Record<Dialect, DialectConfig> = {
    postgres: POSTGRES_CONFIG,
    redshift: REDSHIFT_CONFIG,
    bigquery: BIGQUERY_CONFIG,
    snowflake: SNOWFLAKE_CONFIG,
    duckdb: DUCKDB_CONFIG,
    databricks: DATABRICKS_CONFIG,
    clickhouse: CLICKHOUSE_CONFIG,
};
