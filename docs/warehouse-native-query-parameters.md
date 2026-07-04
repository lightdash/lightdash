# Warehouse-Native Query Parameters

This document is (1) a complete audit of every site where end-user input affects the SQL we send to
a customer's warehouse, and (2) a design for replacing string-escaping of user values with
warehouse-driver **native bind parameters** — so that user-supplied values travel to the warehouse
as *data*, never as SQL text.

---

## 1. Motivation & security model

Lightdash models two kinds of user:

| User type | Typical role | Warehouse SQL access |
|---|---|---|
| **SQL-capable** | developer / admin | May author raw SQL: SQL runner (`manage:SqlRunner`), SQL charts (`manage:CustomSql`), custom SQL dimensions (`manage:CustomFields`), SQL table calculations (`manage:CustomSqlTableCalculations`), virtual views, semantic-layer edits |
| **Semantic-layer-only** | editor / interactive_viewer / viewer | May only *parameterize* queries: pick fields, set filter values, use autocomplete, create simple (non-SQL) custom metrics, use table-calc formulas/templates — never author SQL |

For the second (much larger) group, every value they type is supposed to be **data**. Today that
guarantee rests entirely on `escapeString()` — a per-dialect string-mangling function (quote
doubling/backslashing, comment stripping, null-byte removal) applied at ~a dozen interpolation
sites. That approach has structural weaknesses:

- **It's deny-list-shaped.** Correctness depends on knowing every dialect's literal-parsing quirks
  (backslash modes, unicode normalization, exotic quote syntax) and on every new code path
  remembering to call it exactly once (double-escaping corrupts values; zero-escaping is an
  injection).
- **It mutates legitimate values.** Comment stripping silently deletes `--` / `/* */` from real
  data (e.g. a product code `AB--01` can never be filtered exactly).
- **It's audited per-site, not per-architecture.** The audit below found the sites are currently
  covered — but nothing prevents the next feature from missing one.

Native bind parameters invert the model: the SQL text contains only structure authored by trusted
sources (dbt models, Lightdash's compiler, SQL-capable users), and user values ride alongside in
the driver's typed parameter channel. Escaping bugs become impossible for bound positions.

---

## 2. Audit: every site where user input affects warehouse SQL

Sites are classified into three groups:

- **Class A — bindable request-time scalars.** User values that appear in SQL *value positions*.
  These are the targets of this design.
- **Class B — validated structural inputs.** User input that shapes SQL structure (identifiers,
  keywords, limits). Cannot be bind parameters in any dialect; must stay allow-listed/validated.
- **Class C — authored SQL.** Raw SQL from permission-gated users. Intentionally embedded verbatim;
  out of scope for binding (but the Class A values layered *on top of* it are in scope).

### 2.1 Class A — bindable request-time scalars

All of these currently funnel through `escapeString` (strings) or numeric/date validation, then
string interpolation.

| # | Site | Where compiled | User value | Current protection |
|---|---|---|---|---|
| A1 | String filter values (EQUALS, NOT_EQUALS, INCLUDE, NOT_INCLUDE, STARTS_WITH, ENDS_WITH) | `renderStringFilterSql`, `packages/common/src/compiler/filtersCompiler.ts:119-202`; values pre-escaped once by `escapeStringValuesOnFilterRule` (:725, applied at :751/:817) | `filter.values[]` | `escapeString` + quote wrap. **LIKE wildcards `%`/`_` not escaped** (functional bug, see §7) |
| A2 | Number filter values (EQUALS…IN_BETWEEN) | `renderNumberFilterSql`, filtersCompiler.ts:219-285 | `filter.values[]` | `validateAndSanitizeNumber` (`Number()`, rejects NaN/Infinity), raw interpolation of the coerced number |
| A3 | Date/timestamp filter boundaries | `renderDateOrTimestampFilterSql`, filtersCompiler.ts:291-617; embedded via `castValue` (:327-360) as `CAST('…' AS timestamp)` / `TIMESTAMP('…','tz')` etc. | `filter.values[]` (absolute dates; relative "in the past N" counts are consumed by moment.js in JS, only the computed boundary reaches SQL) | moment reformatting to `YYYY-MM-DD [HH:mm:ss]`; no escaping needed today because the formatter constrains the charset |
| A4 | Boolean filter values | `renderBooleanFilterSql`, filtersCompiler.ts:703-723 | `filter.values[]` | `convertToBooleanValue` → literal `true`/`false` |
| A5 | Filter autocomplete search term | `getFieldValuesMetricQuery`, `packages/backend/src/services/ProjectService/fieldValuesQueryBuilder.ts:111-130` → wrapped as an INCLUDE filter rule → A1 | `search` string typed live in filter UI | Same as A1 (this is the highest-volume untrusted-input path: fires per keystroke for viewers) |
| A6 | Drill-down / underlying-data / drill-by values | `AsyncQueryService.executeAsyncUnderlyingDataQuery` (…/AsyncQueryService.ts:5419-5716); row values become filter rules → A1-A4 | clicked cell values | Standard filter compiler |
| A7 | Dashboard filter values (incl. applied to SQL charts via `SqlQueryBuilder`) | `addDashboardFiltersToMetricQuery` (AsyncQueryService.ts:4246), SQL-chart path AsyncQueryService.ts:6032-6093 → `SqlQueryBuilder` renders via `renderFilterRuleSql` | dashboard filter values | Standard filter compiler |
| A8 | Simple custom-metric filters (custom metrics without SQL) | `exploreCompiler.ts:1181-1258` → `renderFilterRuleSqlFromField` wrapped in `CASE WHEN … THEN … END` | `additionalMetrics[].filters[].values` | Standard filter compiler |
| A9 | Table-calculation filters | `renderTableCalculationFilterRuleSql`, filtersCompiler.ts:737-797 | filter values on table calcs | Standard filter compiler |
| A10 | Project **parameter** values (`${ld.parameters.x}`) in value positions | `safeReplaceParameters` / `safeReplaceParametersWithTypes`, `packages/backend/src/utils/QueryBuilder/parameters.ts:86/165`; engine `replaceLightdashValues`, `packages/backend/src/utils/QueryBuilder/utils.ts:155-261` | parameter values chosen at query time | strings: `escapeString` + quote; numbers: `validateAndSanitizeNumber` raw; dates: strict ISO regex → `CAST('…' AS DATE)`. Inside filter values, substituted **raw** (`unsafeReplaceParametersAsRaw`) and re-escaped downstream by A1's pre-escape |
| A11 | **User attribute** values (`${lightdash.attributes.x}` in `sql_filter`/`sql_where`/dimension SQL) in value positions | `replaceUserAttributes*`, utils.ts:263-324; applied across MetricQueryBuilder (base table :1979, joins :2042/:2469/:2627, dimension SQL :1022, metric SQL :1409, `sql_where` :853, filter values raw :1634) | per-user attribute values set by org admins, evaluated per query | `escapeString` + quote (`AsStrings` variant) or raw + downstream filter-compiler escape (`Raw` variant) |
| A12 | Custom-group dimension values & group names | `renderValueCondition` / `getCustomGroupSelectSql`, `packages/common/src/utils/customDimensions.ts:104-218` | group names, match values | `createEscapeValue` + **`escapeLikeWildcards`** (the one path that escapes `%`/`_` correctly) |
| A13 | Custom bin/range bounds in comparison positions | `getCustomBinDimensionSql`, `packages/backend/src/utils/QueryBuilder/utils.ts:625-897`; `getFixedWidthBinSelectSql` / `getCustomRangeSelectSql`, customDimensions.ts:26-91 | `binWidth`, `binNumber`, `range.from/to` (typed `number`) | TypeScript type only — **no runtime coercion** at interpolation |
| A14 | Pivot sort-anchor values | `PivotQueryBuilder.renderAnchorMatchCondition`, `packages/backend/src/utils/QueryBuilder/PivotQueryBuilder.ts:960-991` → synthetic EQUALS rule → A1 | pinned column value | Standard filter compiler |
| A15 | Metrics-explorer date ranges / compare-to | `MetricsExplorerService.ts:120-353` → standard date filter rules → A3 | start/end dates | Standard filter compiler |

### 2.2 Class B — validated structural inputs (stay inline, keep/strengthen validation)

| # | Site | Where | Current protection | Action |
|---|---|---|---|---|
| B1 | `LIMIT` | `getLimitSQL`, `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts:1967-1970` | TS `number` type only; autocomplete path validates (`fieldValuesQueryBuilder.ts:30-44`) | Add runtime `validateAndSanitizeNumber` + integer/range check at the interpolation site. Bind params in LIMIT are not portable across dialects — keep inline |
| B2 | Sort direction / NULLS ordering | `getSortSQL`, MetricQueryBuilder.ts:1857-1945 | boolean-gated (`s.descending ? ' DESC' : ''`) — never raw text | None needed |
| B3 | Sort/field identifiers, pivot references | quoted `${fieldQuoteChar}${fieldId}${fieldQuoteChar}`, validated against explore fields | field-existence lookup + identifier quoting | None needed; identifiers can never be bound |
| B4 | Granularity / interval units (date zoom, period-over-period) | `getIntervalSyntax` MetricQueryBuilder.ts:194-289; `getSqlForTruncatedDate` `packages/common/src/utils/timeFrames.ts:736` | enum-driven (`TimeFrames`, `DateGranularity`); custom strings only matched against existing explore dimensions | None needed; interval units are keywords, not bindable |
| B5 | `timezone` session setting | raw `SET TIME ZONE '${tz}'` in Snowflake (:533), Trino (:293), Databricks (:394), Postgres (:452); DuckDB escapes; ClickHouse uses settings object | `isValidTimezone` (Intl-based, throws on non-IANA) on every path incl. embed `?timezone=` | Defense-in-depth: apply `escapeString` in the four raw sites (one-line fixes). Cannot be a bind param (session statement) in most drivers |
| B6 | User attributes in FROM/JOIN (table-reference position) | `replaceUserAttributesInSqlTable`, utils.ts:339, guarded by `assertSafeSqlIdentifierValue` (:330, `^[A-Za-z0-9_.-]*$` allow-list) | charset allow-list, throws ForbiddenError | None needed — this is the correct pattern for identifier positions |
| B7 | Catalog/metadata lookups (`getFields`, `getAllTables`) with user-supplied table/schema names | Postgres already **parameterized** (`$1/$2/$3`, PostgresWarehouseClient.ts:642-653); Snowflake information_schema branch parameterized (`?`, :1030); **Snowflake `SHOW COLUMNS IN TABLE ${table}` is raw** (SnowflakeWarehouseClient.ts:917); Trino/BigQuery interpolate schema/db names | gated on `manage:SqlRunner` (caller already has raw SQL) | Fix the Snowflake raw site with identifier quoting/allow-list (§7). No privilege escalation, but shouldn't be raw |
| B8 | `binNumber` as loop bound / label concatenation | utils.ts:765-834 | JS `Array(n)` loop; label text | Stays inline (structural); harden with same runtime number validation as B1 |

### 2.3 Class C — authored SQL (permission-gated, embedded verbatim by design)

| Site | Permission gate | Notes |
|---|---|---|
| SQL runner statements | `manage:SqlRunner` at run time (AsyncQueryService.ts:5740, ProjectService.ts:5556) | raw by definition |
| Saved SQL charts (`from.sql` in `SqlQueryBuilder`) | save gated `manage:CustomSql`; run gated `manage:SqlRunner` | dashboard-filter *values* on top are Class A7 |
| Virtual views | `create/manage:VirtualView` | becomes explore `sqlTable` |
| Custom SQL dimensions | `manage:CustomFields` — **save-time only** (SavedChartService.ts:595-609) | ⚠️ see §7 run-time gap |
| SQL table calculations | `manage:CustomSqlTableCalculations` — **save-time only** (SavedChartService.ts:625-639) | ⚠️ see §7 run-time gap |
| Formula/template table calcs | none needed (no raw SQL); compiled by `@lightdash/formula` | string literals inside formulas are escaped per-dialect by `packages/formula/src/codegen/generator.ts:511` + `dialects.ts` — could be bound in a later phase, low priority (author-level input) |
| dbt model/dimension/metric SQL, `sql_filter`/`sql_where` templates | semantic-layer edit permissions (git integration) | the `${ld.parameters.*}` / `${lightdash.attributes.*}` *values* inside them are Class A10/A11 |
| Liquid `{% if %}` blocks in parameterized SQL | template is authored; condition evaluation happens in JS (`renderLiquidSql`, parameters.ts:183) | parameter values only select *which authored branch* renders — structural, stays as-is |

### 2.4 Where the SQL actually leaves the building

Everything above converges on one chokepoint:
`AsyncQueryService.runAsyncWarehouseQuery` → `warehouseClient.executeAsyncQuery({ sql, tags, timezone })`
(`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:2166-2173`), plus a direct
`streamQuery` for SQL-runner column discovery (:5926) and `runQuery` for autocomplete
(ProjectService.ts:6082). **None of them pass `values`/`queryParams` today** — even though the
interface supports it (§3).

---

## 3. What already exists (this is less of a greenfield than expected)

Two facts make this refactor much cheaper than it first appears:

**1. The warehouse interface already models bind parameters.**
`WarehouseExecuteAsyncQueryArgs` (`packages/common/src/types/warehouse.ts:56`) already declares
`values?: AnyType[]` (positional) and `queryParams?: Record<string, AnyType>` (named), and
`streamQuery`/`runQuery` accept `values`. `WarehouseBaseClient.executeAsyncQuery` already forwards
both into `streamQuery` (WarehouseBaseClient.ts:91-134).

**2. Seven of nine adapters already wire binds through to their drivers** (used today only for
catalog lookups):

| Adapter | Driver | Bind wiring today | Native placeholder | Notes |
|---|---|---|---|---|
| Postgres | `pg` + `pg-cursor` | ✅ `new QueryStream(sql, values)` (PostgresWarehouseClient.ts:353-364) | `$1, $2, …` (repeatable) | best support |
| Redshift | `pg` (extends Postgres) | ✅ inherited | `$1` | |
| Snowflake | `snowflake-sdk` | ✅ `connection.execute({sqlText, binds})` (:668/:740/:825) | `?` positional, `:1` numbered (repeatable) | |
| BigQuery | `@google-cloud/bigquery` | ✅ `createQueryJob({params: values})` (:321-335) | array → `?`, object → `@name` | null values need explicit `types` |
| Databricks | `@databricks/sql` | ✅ `executeStatement(sql, {ordinalParameters})` (:403-408) | `?` ordinal; driver also supports named `:name` (`namedParameters`, not wired) | |
| DuckDB | `@duckdb/node-api` | ✅ `db.stream(sql, values \| queryParams)` (:1563, `getBindValues` :1295) | `?`, `$1`, `$name` | only adapter honoring both forms |
| ClickHouse | `@clickhouse/client` | ✅ `client.query({query, query_params})` (:264-272) | named **typed** `{name:Type}` only | placeholder must carry the ClickHouse type |
| Trino | `trino-client` | ❌ no bind arg in `session.query(sql)` (:295) | server-side `PREPARE`/`EXECUTE … USING` only; the npm client exposes no bind API, and `USING` takes SQL literals anyway | **inline fallback, indefinitely** |
| Athena | `@aws-sdk/client-athena` | ❌ `StartQueryExecutionCommand({QueryString})` (:417-428) | `ExecutionParameters: string[]` with `?` exists in the SDK — but parameters are passed as literal SQL text (AWS examples quote strings: `"'2016-08-09'"`), and are restricted to `WHERE` in older engine versions | **needs a spike**; treat as inline fallback until verified |

So the real work is not "add parameter support to the drivers" — it's **(a)** making the compiler
*emit* placeholders + a value list instead of inlined literals, **(b)** threading that pair through
the backend to the chokepoint, and **(c)** handling the two adapters with no usable bind channel
via a single, centralized inline-rendering fallback.

**The one hidden coupling: the results cache.**
`QueryHistoryModel.getCacheKey` (`packages/backend/src/models/QueryHistoryModel/QueryHistoryModel.ts:75-99`)
is `sha256("v3.<projectUuid>[.<userUuid>].<sql>[.<timezone>]")` — the *literal-inlined SQL string*
is the cache identity. Once values move out of the SQL text, `WHERE name = ?` would collide for
every distinct value. The cache key must incorporate the parameter values (§4.6).

---

## 4. Design

### 4.1 Core idea

Compile once with **internal named placeholder tokens** in the SQL string plus an ordered value
map; then, immediately before execution, a per-adapter **finalizer** rewrites tokens into the
driver's native placeholder syntax and produces the driver-shaped values argument — or, for
adapters without a bind channel, inlines the values with the existing `escapeString` (making
today's behavior the *fallback*, implemented in exactly one place).

```
                    compile (common/backend)                      finalize (warehouses)
filter values ──┐                                            ┌─ pg/redshift:  $1..$n + values[]
parameters ─────┤   SQL with tokens                          ├─ snowflake:    :1..:n + binds[]
user attrs ─────┼─► "WHERE x = !LDP:a3f9c2:0!"  ──────────►  ├─ databricks:   ?      + ordinalParameters[]
custom groups ──┤   + ParameterSet                           ├─ bigquery:     @ldp0  + params{}  (+types)
pivot anchors ──┘   { nonce, entries: [{value, type}] }      ├─ duckdb:       $ldp0  + queryParams{}
                                                             ├─ clickhouse:   {ldp0:String} + query_params{}
                                                             └─ trino/athena: escapeString-inlined literal
```

Why an internal token format rather than emitting driver placeholders directly:

- **SQL fragments get concatenated, wrapped, reordered and duplicated** during compilation (CTEs,
  pivot wrapping, `UPPER(…)` case-insensitivity, count-wrapper queries, `FROM (…) AS x` SQL-chart
  wrapping). Positional `?` cannot survive that; named tokens can, in any order, any number of
  times.
- **Authored SQL legitimately contains `?` and `$`** (Postgres JSONB `?` operator, `$$`-quoting,
  regexes in string literals). Driver placeholder syntax in the wrong dialect would be misparsed.
  The token format must be something that *never* occurs naturally.
- **Late binding of dialect syntax** keeps `packages/common` compilation dialect-agnostic and lets
  each adapter choose positional vs named per its driver.

### 4.2 Token format & forgery resistance

```
!LDP:<nonce>:<index>!        e.g.  !LDP:a3f9c2d1:12!
```

- `nonce`: 8+ hex chars of cryptographic randomness, generated once per query compilation and
  stored on the `ParameterSet`. A token is only honored if its nonce matches. This means **authored
  SQL cannot forge a token** (Class C authors can't know the nonce, so a pasted token never matches
  and finalization fails loudly rather than substituting someone's value).
- The finalizer errors if (a) any token with the current nonce remains unmatched, (b) any entry in
  the `ParameterSet` was never referenced *(configurable — repeated/elided references are legal for
  fragments that get dropped, e.g. unused CTEs)*, or (c) a token-shaped string with a *wrong* nonce
  is found (belt-and-braces against cross-query leakage).
- Tokens are inert if they somehow escape to a warehouse (syntax error, not silent misbehavior).

### 4.3 The binder API (what the compiler sees)

A `SqlValueBinder` is created per query compilation and threaded to every Class A site — the exact
same places that receive `escapeString` today:

```ts
// packages/common/src/utils/sqlValueBinder.ts
interface SqlValueBinder {
    bindString(value: string): string;   // returns the SQL snippet to embed
    bindNumber(value: number): string;   // validates (NaN/Infinity → CompileError)
    bindBoolean(value: boolean): string;
    bindDate(isoDate: string): string;      // pre-validated 'YYYY-MM-DD'
    bindTimestamp(isoTs: string): string;   // pre-validated timestamp text
}
```

Two implementations:

- **`CollectingBinder`** — appends `{ value, type }` to the `ParameterSet`, returns the token.
  Type information is retained because ClickHouse placeholders are typed (`{ldp0:String}`),
  BigQuery needs explicit types for nulls, and dates bind as text inside the existing structural
  `CAST(<token> AS timestamp)` wrappers (which stay exactly as they are — only the quoted literal
  inside becomes a token).
- **`InlineBinder`** — reproduces today's behavior byte-for-byte: `escapeString` + quote-wrap for
  strings, validated raw interpolation for numbers/booleans, formatted-and-quoted for dates. Used
  for (a) adapters without a bind channel, (b) the kill-switch/feature-flag-off path, and (c)
  rendering display SQL (§4.7).

Because both implement one interface, **the binder becomes the single choke point for
value-into-SQL** — the property we currently lack. New code physically cannot choose "raw
interpolation" without bypassing an obvious abstraction, which is easy to lint for (forbid
`escapeString` outside binder implementations once migration completes).

Threading: `renderFilterRuleSql` & co. today take `escapeString`/`stringQuoteChar`/
`escapeStringQuoteChar` as separate arguments. Replace that trio with the binder (the compiler is
used only from `packages/common` + backend — no frontend imports, verified). The pre-escape hook
`escapeStringValuesOnFilterRule` (filtersCompiler.ts:725) is **deleted** in the bind path — values
go into `bindString` raw. This also removes the current "escape once, then substitution layers must
insert raw text so it gets escaped exactly once later" invariant (MetricQueryBuilder.ts:1621-1642),
which is the subtlest part of today's code: under binds, parameter/user-attribute substitution into
filter values happens on the *JS value* before binding, and the double-vs-zero-escape hazard
disappears entirely.

Compilation output changes from `string` to:

```ts
type CompiledSql = {
    sql: string;                 // contains !LDP:nonce:i! tokens
    parameters: ParameterSet;    // { nonce: string; entries: Array<{ value: unknown; type: BindType }> }
};
```

`CompiledQuery` / `CompiledMetricQuery` carry `parameters` alongside `query`.

### 4.4 Per-site mapping (what each Class A site becomes)

| Site | Today | With binder |
|---|---|---|
| A1 string filters | `(dim) IN ('${escaped}', …)` | `(dim) IN (${bind(v1)}, ${bind(v2)}, …)` — one token per element. LIKE variants build the pattern in JS: `bindString('%' + escapeLikeWildcards(v) + '%')` — which **fixes the wildcard bug for free** (the `ESCAPE '\'` clause is structural). Case-insensitive `UPPER()` wraps the token; the `.toUpperCase()` on the value happens in JS as today |
| A2 number filters | validated raw | `bindNumber(v)` |
| A3 date filters | `CAST('${formatted}' AS timestamp)` | `CAST(${bindTimestamp(formatted)} AS timestamp)` — moment formatting/relative-date math unchanged, only the literal is bound |
| A4 boolean | `true`/`false` | `bindBoolean(v)` |
| A5 autocomplete | via A1 | via A1 (biggest win: per-keystroke untrusted input becomes pure data) |
| A6/A7/A14/A15 | via A1-A4 | inherit automatically |
| A8 custom-metric filters | via filter compiler inside `CASE WHEN` | same, binder threaded through `exploreCompiler.compileMetric` — note this compile happens **per request** for `additionalMetrics`; dbt-defined metric filters baked into *cached explores* stay inline (they're authored content, and cached SQL can't carry per-query tokens) |
| A9 table-calc filters | via filter compiler | same |
| A10 parameters | `safeReplaceParameters*` escape/quote/CAST per type | `replaceLightdashValues` calls the binder instead of quoting: strings → `bindString`, numbers → `bindNumber`, dates → `CAST(${bindDate(v)} AS DATE)`. Array values expand to one token per element (comma-joined). `unsafeReplaceParametersAsRaw` (raw-into-filter-value) is replaced by substituting into the JS value pre-bind. Liquid conditionals unchanged (structural) |
| A11 user attributes | same engine as A10 | same as A10. The FROM/JOIN identifier variant (B6) keeps its allow-list — identifier positions can never bind |
| A12 custom groups | `createEscapeValue` + `escapeLikeWildcards` | `bindString` (+ JS-side `escapeLikeWildcards` for LIKE variants); group *name* in the SELECT literal → `bindString(group.name)` |
| A13 bin bounds | raw `number` interpolation | `bindNumber(range.from)` etc. in comparison positions; occurrences inside *labels* (`concatString('<', …)`) also bindable; `binNumber` as JS loop bound stays JS-side (B8) |

### 4.5 Finalization (packages/warehouses)

One shared utility plus a per-adapter capability declaration:

```ts
// packages/warehouses/src/utils/parameterFinalizer.ts
type ParameterStyle =
    | { kind: 'positional-dollar' }                  // pg, redshift    → $n, dedupe repeats
    | { kind: 'positional-numbered' }                // snowflake       → :n, dedupe repeats
    | { kind: 'positional-question' }                // databricks      → ?, value per occurrence
    | { kind: 'named'; render: (name: string, type: BindType) => string }
      // bigquery @ldp0 · duckdb $ldp0 · clickhouse {ldp0:String}
    | { kind: 'inline' };                            // trino, athena (for now) → InlineBinder

finalizeSqlParameters(sql, parameters, style): {
    sql: string;
    values?: AnyType[];
    queryParams?: Record<string, AnyType>;
}
```

- Implemented as a single left-to-right scan for the token regex (validating the nonce), so it's
  O(n) and cannot be confused by token-like text inside string literals (wrong nonce → hard error,
  see §4.2).
- `WarehouseSqlBuilder` gains `getParameterStyle(): ParameterStyle`. `WarehouseBaseClient.
  executeAsyncQuery`/`streamQuery`/`runQuery` call the finalizer when args carry a `ParameterSet`,
  so **backend call sites stay dumb**: they pass `{ sql, parameters }` and each adapter does the
  right thing. Adapters that already read `options.values`/`queryParams` need no execution changes.
- **Repeats**: named styles and `$n`/`:n` reference the same entry many times; `?`-only styles
  duplicate the value per occurrence. The finalizer handles this; the compiler never thinks about
  it.
- **Bind-count ceiling**: drivers/services cap parameters (Postgres protocol 65k, BigQuery ~10k,
  others lower in practice). Users do paste 10k-ID filter lists. The `CollectingBinder` takes a
  `maxBinds` (default ~1000); past it, it degrades to inline rendering *for the overflow values
  only* — both paths are correct, so this is a per-value decision, not a per-query mode.
- **Session statements** (`SET TIME ZONE`, `SET statement_timeout`) are separate driver calls and
  keep their current (validated) handling — B5.
- Query-tag comment appending (`getSQLWithMetadata`) is unaffected (system-controlled JSON).

### 4.6 Results cache & query history

- `QueryHistoryModel.getCacheKey` becomes
  `sha256("v4.<projectUuid>[.<userUuid>].<sql>.<canonicalParams>[.<timezone>]")` where
  `canonicalParams` is a stable serialization of parameter **values in entry order** (types
  included; the nonce is *excluded* — it's random per compile and would destroy cache hits, which
  also means tokens in the hashed SQL text must be normalized to their index, e.g. `!LDP:0!`,
  before hashing). Bump `CACHE_VERSION` → `v4` (one-time cold cache, same as any invalidation).
- `query_history.compiled_sql` stores the normalized parameterized SQL, and a new nullable JSONB
  column stores the parameter entries. Storing values separately is also a small observability win:
  Sentry/PostHog/debug logging can redact values while keeping SQL shape.

### 4.7 Display SQL, "view compiled SQL", and explore-from-here

Users (and support) see compiled SQL in the app; "explore from here → SQL runner" hands users a
runnable SQL string. Those surfaces need literals, not tokens. Provide
`renderInlineSql(sql, parameters, sqlBuilder)` — the `InlineBinder`'s rendering applied to a
finished token string — producing exactly what today's compiler produces. Execution and display
diverge on purpose: display SQL is a *rendering* of the query, no longer the executed artifact
byte-for-byte. (CSV/gsheets exports, scheduler runs, etc. re-execute through the normal path and
are unaffected.)

### 4.8 What deliberately does NOT change

- Class B validation (limits, identifiers, granularities, timezone) — strengthened where noted, but
  stays inline; no dialect can bind those positions.
- Class C authored SQL — verbatim as today, gated by the same permissions.
- `escapeString` survives in three roles: the `InlineBinder`, catalog/metadata queries, and
  Liquid/legacy paths — but it stops being the security boundary for semantic-layer users on
  bind-capable warehouses.
- Explore compilation & caching (`cached_explores`) — authored SQL, no per-query values, untouched.

---

## 5. Rollout plan

The refactor is a hot path (every query in the product), so each phase is independently shippable
and reversible, with the `InlineBinder` as a permanent kill-switch.

**Phase 0 — plumbing (no behavior change).**
Add `parameters` to `WarehouseExecuteAsyncQueryArgs` handling in `AsyncQueryService.
runAsyncWarehouseQuery` (:2166) and the other two chokepoints; add `getParameterStyle()` returning
`inline` everywhere; add the finalizer with tests; extend the cache key to hash
`(normalizedSql, params)` behind the same version bump. Wire Trino/Athena explicitly as `inline`.

**Phase 1 — binder in the filter compiler, flag-gated per warehouse.**
Introduce `SqlValueBinder`; convert `filtersCompiler` (A1-A4) and thread through
`MetricQueryBuilder`, `SqlQueryBuilder`, `PivotQueryBuilder`, `fieldValuesQueryBuilder`,
`exploreCompiler` (additional metrics). Feature flag `warehouse-native-parameters`, enabled
per-project-warehouse-type, starting **Postgres + DuckDB** (best drivers, easiest local testing),
default off. A5-A9/A14/A15 come along automatically.

**Phase 2 — substitution engine.**
Convert `replaceLightdashValues` (A10 parameters, A11 user attributes) and custom
dimensions/bins (A12, A13). Delete `escapeStringValuesOnFilterRule` and the
raw-then-reescape dance in `getFilterRuleSQL` for the bind path.

**Phase 3 — remaining warehouses.**
Enable Snowflake, BigQuery, Databricks, Redshift, ClickHouse after per-adapter contract tests (§6).
Spike Athena `ExecutionParameters` semantics (literal-text vs typed binds; WHERE-only restriction);
adopt only if it's a real bind channel. Trino stays `inline` until the client/protocol offers
a usable bind API.

**Phase 4 — flip defaults & lock down.**
Default the flag on for supported warehouses; add a lint rule forbidding `escapeString` outside
binder/finalizer/catalog code; update the security model docs so new value-position code must go
through the binder.

Rough sizing: Phase 0-1 is the bulk (compiler signature threading touches many call sites but
mechanically); Phases 2-3 are incremental. The blast radius is contained by the fact that
`InlineBinder` output is required to be byte-identical to today's compiler output — which is
directly assertable in tests against the existing snapshot suites.

---

## 6. Testing strategy

- **Equivalence tests**: compile the existing `filtersCompiler.test.ts` / `MetricQueryBuilder`
  snapshot corpus with `InlineBinder` and assert byte-identical output to current code (guards the
  refactor itself).
- **Round-trip contract tests per adapter** (extend the existing warehouse integration tests): bind
  and read back adversarial values — `'`, `\'`, `\\`, `"`, `--x`, `/*x*/`, `%`, `_`, `?`, `$1`,
  `@p0`, `{x:String}`, newlines, NUL-adjacent unicode, `!LDP:deadbeef:0!` itself, 10k-element IN
  lists, unicode normalization cases. Every value must round-trip **unmodified** (nb: today's
  comment-stripping makes some of these fail by design — binds fix that).
- **Finalizer unit tests**: repeats, out-of-order tokens, wrong-nonce rejection, leftover-token
  rejection, overflow-to-inline, each style's output shape.
- **Cache-key tests**: same SQL different values → different keys; same query recompiled (new
  nonce) → same key.
- **E2E**: existing Cypress suites run per-warehouse with the flag on.

---

## 7. Related findings from the audit (independent fixes, not blocked on this design)

1. **Run-time permission gap for custom SQL (security-relevant to the two-user model).**
   `manage:CustomFields` / `manage:CustomSqlTableCalculations` are enforced only when *saving* a
   chart with changed SQL (`SavedChartService.ts:595-639`). Ad-hoc query execution with
   `customDimensions` / SQL table calcs in the request body is **not** gated —
   `CustomSqlQueryForbiddenError` (errors.ts:767) is imported in `AsyncQueryService.ts:22`,
   `ProjectService.ts:48`, `GdriveService.ts:4` but never thrown. A semantic-layer-only user who
   crafts an API request can execute arbitrary SQL expressions today, which makes it the single
   most important gap for the stated security model — parameterization doesn't help here because
   this is authored-SQL smuggling, not value injection. Fix: enforce the abilities at query-run
   time in `AsyncQueryService` when the metric query carries custom SQL dimensions / SQL table
   calcs.
2. **LIKE wildcard escaping inconsistency.** `renderStringFilterSql` INCLUDE/STARTS_WITH/ENDS_WITH
   (filtersCompiler.ts:159-197) does not escape `%`/`_`, while custom groups
   (customDimensions.ts:95-125) do. Not injection, but wrong results (`50%` matches `503`). Fixed
   for free in Phase 1; can also be fixed standalone by porting `escapeLikeWildcards` + `ESCAPE`.
3. **`escapeString` mutates legitimate values** (strips `--`, `/* */`). Correctness bug for real
   data; disappears for bound positions.
4. **Timezone raw interpolation** into `SET TIME ZONE '${tz}'` in Snowflake/Trino/Databricks/
   Postgres clients (validated upstream by `isValidTimezone`, but should call `escapeString` like
   DuckDB does — one-line defense-in-depth each).
5. **Snowflake `SHOW COLUMNS IN TABLE ${table}`** (SnowflakeWarehouseClient.ts:917) interpolates a
   user-supplied table name unescaped (reachable only with `manage:SqlRunner`, so no escalation,
   but should be quoted/validated like the parameterized branch at :1030).
6. **`LIMIT` and bin bounds trust the TS type** with no runtime coercion
   (MetricQueryBuilder.ts:1969; QueryBuilder/utils.ts:686/:763/:848). TSOA validates request
   bodies, but internal callers bypass it — add `validateAndSanitizeNumber` at the interpolation
   sites (B1/B8).

---

## 8. Open questions

1. **Athena `ExecutionParameters` semantics** — literal-text substitution or typed binds? Engine
   version restrictions (`WHERE`-only)? Needs a spike against a real Athena workgroup before
   promoting Athena out of `inline`.
2. **Snowflake `:n` vs `?`** — `:n` allows entry reuse (smaller bind arrays for repeated tokens);
   verify `snowflake-sdk@2.x` supports numbered binds with `streamResult`/`asyncExec` before
   choosing it over `?`.
3. **BigQuery null/typed params** — filter NULL operators emit `IS NULL` (no value), so nulls
   should never be bound; decide whether to hard-error on `bind*(null)` or pass explicit `types`.
4. **Warehouse-side caching** — Snowflake's result cache and BigQuery's cache key on exact
   query+params; parameterized queries neither help nor hurt correctness, but per-warehouse cache
   hit-rate changes are worth watching during rollout.
5. **`SqlQueryBuilder` limit stripping** — `removeCommentsAndOuterLimitOffset` regex-processes
   authored SQL; confirm it can never eat a token (tokens contain no `--`; current regexes are
   fine, add a test).
