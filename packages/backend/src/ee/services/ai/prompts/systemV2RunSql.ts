import { WarehouseTypes, type AgentSqlScope } from '@lightdash/common';

const WAREHOUSE_HINTS: Record<WarehouseTypes, string> = {
    [WarehouseTypes.POSTGRES]:
        'PostgreSQL dialect. Use generate_series for date spines, UNNEST for arrays, regex with ~ / ~*, PERCENTILE_CONT for medians.',
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
        'DuckDB SQL dialect (Postgres-compatible). Use generate_series, UNNEST for arrays, quantile_cont for medians, regexp_matches for regex. DuckLake-configured projects expose tables under an attached catalog and follow the project schema.',
};

type SqlWords = {
    heading: string;
    preferSemanticLayer: string;
    semanticQuery: string;
    approvalCost: string;
    useSql: string;
    sqlUnit: string;
    sqlUnits: string;
};

const RUN_SQL_WORDS: SqlWords = {
    heading: '**Raw SQL (runSql tool):**',
    preferSemanticLayer:
        'Use the semantic layer when an explore covers the question: it is governed and reusable.',
    semanticQuery: 'the semantic layer',
    approvalCost: 'Every `runSql` call costs the user an approval click',
    useSql: 'runSql',
    sqlUnit: '`runSql` call',
    sqlUnits: '`runSql` calls',
};

// Composer runs raw SQL as `sql` nodes; the node schema states their limits.
const COMPOSER_SQL_WORDS: SqlWords = {
    heading: '**Raw SQL (runComposerQueries `sql` nodes):**',
    preferSemanticLayer:
        'Use semanticLayer nodes when an explore covers the question: they are governed and reusable.',
    semanticQuery: 'a semanticLayer node',
    approvalCost:
        'Every submission with `sql` nodes costs the user an approval click',
    useSql: '`sql` nodes',
    sqlUnit: '`sql` node',
    sqlUnits: '`sql` nodes',
};

export const getRunSqlSection = ({
    warehouseType,
    warehouseSchema,
    warehouseConnections = [],
    sqlScope,
    viaComposerQueries = false,
}: {
    warehouseType: WarehouseTypes | null;
    warehouseSchema: string | null;
    warehouseConnections?: {
        name: string;
        warehouseConnectionUuid: string | null;
        warehouseType: WarehouseTypes;
        isOriginal: boolean;
    }[];
    sqlScope?: AgentSqlScope | null;
    viaComposerQueries?: boolean;
}) => {
    const warehouseLine = warehouseType
        ? `Warehouse: ${warehouseType}. ${WAREHOUSE_HINTS[warehouseType] ?? ''}`
        : 'Use the SQL dialect of the connected warehouse.';

    // When any scope is configured the qualification rules apply, because the
    // guard cannot classify a bare table name or a comma-join operand.
    const SCOPE_RULES =
        'The server rejects any query that reads outside this scope, any table that is not schema-qualified, and comma joins (`FROM a, b`), so write explicit JOINs between qualified tables. When the data the user asked for is out of scope, say so plainly instead of substituting a different table.';

    const list = (values: string[]) => values.map((v) => `\`${v}\``).join(', ');

    const allowedSchemas = sqlScope?.schemas.length ? sqlScope.schemas : null;
    const deniedSchemas = sqlScope?.deniedSchemas?.length
        ? sqlScope.deniedSchemas
        : null;

    const scopeParts = [
        allowedSchemas
            ? `Allowed schemas for this project: ${list(allowedSchemas)}.`
            : null,
        sqlScope?.catalogs?.length
            ? `Allowed catalogs for this project: ${list(
                  sqlScope.catalogs,
              )}. Qualify every table as catalog.schema.table; the server rejects two-part references because it cannot confirm their catalog.`
            : null,
        deniedSchemas
            ? `Schemas outside the scope: ${list(deniedSchemas)}.`
            : null,
        sqlScope?.deniedCatalogs?.length
            ? `Catalogs outside the scope: ${list(sqlScope.deniedCatalogs)}.`
            : null,
    ].filter((part): part is string => part !== null);

    const scopeLine = scopeParts.length
        ? `${scopeParts.join(' ')} ${SCOPE_RULES}`
        : null;

    const connectionLines = warehouseConnections
        .map(
            (connection) =>
                `- ${JSON.stringify(connection.name)} (${connection.warehouseConnectionUuid ?? 'original'}): ${connection.warehouseType}. ${WAREHOUSE_HINTS[connection.warehouseType]}${connection.isOriginal ? ' This is the original connection.' : ''}`,
        )
        .join('\n');

    const schemaLine = warehouseSchema
        ? `The default schema for this project is \`${warehouseSchema}\`. Qualify every table with it (e.g. \`${warehouseSchema}.fm_work_orders\`): bare table names fail.`
        : 'The warehouse schema is unknown: discover it with listWarehouseTables before writing SQL.';

    const words = viaComposerQueries ? COMPOSER_SQL_WORDS : RUN_SQL_WORDS;

    return `
${words.heading}
${
    warehouseConnections.length > 1
        ? `
Raw SQL and the warehouse discovery tools reach only the original connection: query tables on the other connections through the semantic layer, one connection per query.
${connectionLines}
`
        : ''
}
**When to use it:**
- ${words.preferSemanticLayer}
- Use ${words.useSql} for these four cases:
  - joins across tables not modelled in any explore
  - recursive CTEs, percentile functions (PERCENTILE_CONT), or warehouse-specific syntax that ${words.semanticQuery} cannot produce
  - lookups in raw tables that are not part of any explore
  - the user explicitly asks for raw SQL

${words.approvalCost}: the user reads the SQL and approves it before it runs.

- Discover tables and columns with listWarehouseTables and describeWarehouseTable, not with SQL: the server rejects any SQL that reads \`information_schema\`. When they do not return what you need, ask the user.
- Build the query from the columns and types discovery returned rather than sampling rows with \`SELECT *\`. To inspect specific values (e.g. enum cardinality), select those columns with \`DISTINCT\` and a tight limit.
- Compose multi-step logic into one query with CTEs and joins. Add another ${words.sqlUnit} only when you need real warehouse values to recover or validate. When several ${words.sqlUnits} lead to the answer, make the final one the composed query and rest the answer on it, unless the final result genuinely came from an intermediate table.
- ${scopeLine ? `${schemaLine} ${scopeLine}` : schemaLine}
- When you are unsure whether to proceed (e.g. chart this SQL or rebuild it in the semantic layer), state the tradeoff once and end with a single closing question.

**Operational rules:**
- SELECT/WITH only. Mutations (INSERT, UPDATE, DELETE, DDL) are rejected server-side.
- The user sees the SQL in the tool activity, so paste it into your final answer only when they ask to see it, in a fenced \`\`\`sql code block (the one exception to the no-code-blocks format rule).
- ${warehouseLine}
`;
};
