import { WarehouseTypes } from '@lightdash/common';

const WAREHOUSE_HINTS: Record<WarehouseTypes, string> = {
    [WarehouseTypes.POSTGRES]:
        'PostgreSQL dialect. Use generate_series for date spines, UNNEST for arrays, regex with ~ / ~*, PERCENTILE_CONT for medians, ON CONFLICT not relevant here (SELECT-only).',
    [WarehouseTypes.BIGQUERY]:
        'BigQuery Standard SQL dialect. Backtick fully-qualified identifiers (`project.dataset.table`). Use UNNEST for arrays, GENERATE_DATE_ARRAY for date spines, APPROX_QUANTILES for percentiles, EXTRACT for date parts.',
    [WarehouseTypes.SNOWFLAKE]:
        'Snowflake SQL dialect. Identifiers are case-folded to UPPERCASE by default; quote with double quotes if you need exact case. Use LATERAL FLATTEN for arrays, GENERATOR for date spines, PERCENTILE_CONT for medians.',
    [WarehouseTypes.REDSHIFT]:
        'Redshift SQL dialect (Postgres-like with caveats). Some window functions and CTEs behave differently than Postgres. PERCENTILE_CONT requires WITHIN GROUP. Avoid lateral joins on user tables.',
    [WarehouseTypes.DATABRICKS]:
        'Databricks SQL / Spark SQL dialect. Use backtick identifiers when needed, sequence(start, stop, step) for date spines, percentile_approx for percentiles, LATERAL VIEW EXPLODE for arrays.',
    [WarehouseTypes.TRINO]:
        'Trino SQL dialect. Use SEQUENCE() for date arrays + UNNEST, approx_percentile for percentiles, regexp_like for regex.',
    [WarehouseTypes.CLICKHOUSE]:
        'ClickHouse SQL dialect. Use arrayJoin for arrays, quantile() / quantileExact() for percentiles, range() for sequences. Identifiers are case-sensitive.',
    [WarehouseTypes.ATHENA]:
        'Athena SQL dialect (Presto-compatible). Use SEQUENCE() + UNNEST for arrays, approx_percentile for percentiles, regexp_like for regex.',
    [WarehouseTypes.DUCKDB]:
        'DuckDB SQL dialect (Postgres-compatible). Use generate_series, UNNEST for arrays, quantile_cont for medians, regexp_matches for regex.',
};

export const getRunSqlSection = (
    warehouseType: WarehouseTypes | null,
    warehouseSchema: string | null,
) => {
    const warehouseLine = warehouseType
        ? `**Warehouse:** ${warehouseType}. ${WAREHOUSE_HINTS[warehouseType] ?? ''}`
        : 'Use the SQL dialect of the connected warehouse.';

    const schemaLine = warehouseSchema
        ? `**Default schema for this project:** \`${warehouseSchema}\`. ALWAYS qualify your tables with this schema (e.g. \`${warehouseSchema}.fm_work_orders\`). Bare table names will fail.`
        : 'You do not know the warehouse schema. Use listWarehouseTables to discover the right schema before writing SQL.';

    return `
**Raw SQL (runSql tool):**
You have access to a runSql tool that executes raw SELECT queries directly against the warehouse.

**When to use it:**
- ALWAYS prefer runQuery (semantic layer) when the question fits — runQuery is governed, charted, and reusable.
- Use runSql ONLY when the semantic layer cannot answer the question:
  - joins across tables not modelled in any explore
  - recursive CTEs, percentile functions (PERCENTILE_CONT), or warehouse-specific syntax that runQuery cannot produce
  - lookups in raw tables that are not part of any explore
  - the user explicitly asks for raw SQL

**ABSOLUTE RULES — these are not preferences, they are hard requirements.**

Every \`runSql\` call costs the user an approval click. Treat each one as if you are emailing the user the SQL and waiting for them to reply YES. If you would not send this SQL to a busy human, do not call \`runSql\`.

**1. ZERO \`information_schema\`.** The server REJECTS any SQL containing \`information_schema\` with a clear error. You have four discovery tools that cover every legitimate use case:

- \`findExplores\` — list explores in the project
- \`findFields\` — columns + types for an **explore-backed** table
- \`listWarehouseTables\` — names of raw / staging / seed tables
- \`describeWarehouseTable\` — columns + types for a **raw** warehouse table

- ❌ NEVER: \`SELECT column_name FROM information_schema.columns WHERE table_name = '...'\` — use \`describeWarehouseTable({ table: '...' })\` instead
- ❌ NEVER: \`SELECT table_name FROM information_schema.tables\` — use \`listWarehouseTables\` instead
- ✅ INSTEAD: pick the right discovery tool above. If none of them returns what you need, **ASK THE USER**.

**2. ZERO \`SELECT *\` sampling.** \`findFields\` already tells you the columns and types. Don't run \`SELECT * FROM x LIMIT 3\` to "see the data" — that's a wasted approval click.

- ❌ NEVER: \`SELECT * FROM jaffle.fm_work_orders LIMIT 3\` to understand structure
- ❌ NEVER: any \`SELECT *\` whose only purpose is exploration
- ✅ INSTEAD: build the real query from \`findFields\` output. If you genuinely need to inspect specific values (e.g. enum cardinality), select THE specific columns with \`DISTINCT\` and a tight limit.

**3. ONE runSql per question.** Compose multi-stage logic into a single query using CTEs (\`WITH a AS (...), b AS (...) SELECT ... FROM b\`). Multiple runSql calls in one turn means you're either iterating because the first attempt was wrong, or you're spelunking — both are bugs.

- ✅ GOOD: one query with 3 CTEs that produces the final answer
- ❌ BAD: query 1 to "check the schema", query 2 to "sample rows", query 3 to actually answer

**4. Recover from schema errors via \`describeWarehouseTable\`, NOT another \`runSql\`.** If your \`runSql\` failed with "column does not exist" or "relation not found":

1. Call \`describeWarehouseTable({ table: '<offending_table>' })\` to get the real columns.
2. Rewrite the SQL once with the correct columns and submit it.
3. If \`describeWarehouseTable\` shows the relationship you need genuinely doesn't exist (e.g. no foreign key, no junction table), STOP and tell the user:

   > "I expected \`X\` but \`raw_parts\` actually has columns \`[...]\` — there's no \`work_order_id\`. The relationship you're asking about isn't modelled here. Would you like \`<alternative>\` as a proxy, or can you point me to the right table?"

NEVER guess column names across multiple \`runSql\` calls. Discovery is free; SQL costs an approval click.

**5. Schema qualification on the first attempt.** ${schemaLine}

**6. Write SQL like the user will read it.** Comment non-trivial logic, use meaningful aliases, format CTEs clearly. The user is about to read every character before clicking Approve.

**Operational rules:**
- SELECT/WITH only. Mutations (INSERT, UPDATE, DELETE, DDL) are rejected server-side.
- Results come back as a table — no chart. If the user wants a chart, suggest re-running with runQuery once fields exist in the semantic layer.
- Default row limit 500, max 5000. Include LIMIT explicitly or rely on the default.
- ${warehouseLine}
`;
};
