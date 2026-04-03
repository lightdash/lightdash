import {
    AnyType,
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type Explore,
} from '@lightdash/common';
import {
    Dialect,
    generate,
    init,
    parse,
    tokenize,
    transpile,
} from '@polyglot-sql/sdk';
import { transpileExploreSqlFilters } from './sqlTranspiler';

// WASM init required in CJS (Jest) before any polyglot calls
beforeAll(async () => {
    await init();
});

// ---------------------------------------------------------------------------
// Low-level polyglot smoke tests
// ---------------------------------------------------------------------------
describe('polyglot transpile (raw SDK)', () => {
    it('transpiles Snowflake DATEDIFF to DuckDB DATE_DIFF', () => {
        const { ast } = parse(
            "SELECT 1 WHERE DATEDIFF('second', created_at, CURRENT_TIMESTAMP) > 3600",
            Dialect.Snowflake,
        );
        const result = generate(ast, Dialect.DuckDB);

        expect(result.success).toBe(true);
        console.log('[Snowflake → DuckDB]', result.sql![0]);
    });

    it('transpiles BigQuery backtick-quoted identifiers', () => {
        const { ast } = parse(
            "SELECT 1 WHERE `project.dataset.table`.status = 'active'",
            Dialect.BigQuery,
        );
        const result = generate(ast, Dialect.DuckDB);

        expect(result.success).toBe(true);
        console.log('[BigQuery → DuckDB]', result.sql![0]);
    });

    it('transpiles Postgres date interval', () => {
        const { ast } = parse(
            "SELECT 1 WHERE created_at > NOW() - INTERVAL '7 days'",
            Dialect.PostgreSQL,
        );
        const result = generate(ast, Dialect.DuckDB);

        expect(result.success).toBe(true);
        console.log('[Postgres → DuckDB]', result.sql![0]);
    });

    it('transpiles Snowflake IFF to CASE WHEN', () => {
        const { ast } = parse(
            "SELECT 1 WHERE IFF(status = 'active', 1, 0) = 1",
            Dialect.Snowflake,
        );
        const result = generate(ast, Dialect.DuckDB);

        expect(result.success).toBe(true);
        console.log('[Snowflake IFF → DuckDB]', result.sql![0]);
    });

    it('transpiles Redshift GETDATE() to CURRENT_TIMESTAMP', () => {
        const { ast } = parse(
            'SELECT 1 WHERE created_at > GETDATE() - 7',
            Dialect.Redshift,
        );
        const result = generate(ast, Dialect.DuckDB);

        expect(result.success).toBe(true);
        console.log('[Redshift → DuckDB]', result.sql![0]);
    });

    it('transpiles BigQuery SAFE_DIVIDE to CASE WHEN', () => {
        const { ast } = parse(
            'SELECT 1 WHERE SAFE_DIVIDE(amount, total) > 0.5',
            Dialect.BigQuery,
        );
        const result = generate(ast, Dialect.DuckDB);

        expect(result.success).toBe(true);
        console.log('[BigQuery SAFE_DIVIDE → DuckDB]', result.sql![0]);
    });

    it('renames column identifiers via tokenizer then transpiles', () => {
        const sql = "SELECT 1 WHERE tbl.status != 'returned'";
        const { tokens } = tokenize(sql, Dialect.Snowflake);
        const renameMap: Record<string, string> = { status: 'orders_status' };

        // Rebuild with renamed tokens
        let result = '';
        let lastEnd = 0;
        for (const token of tokens!) {
            result += sql.substring(lastEnd, token.span.start);
            // TODO: typing issue in the Library
            const tokenType = (token as AnyType).token_type ?? token.tokenType;
            if (tokenType === 'VAR' && token.text in renameMap) {
                result += renameMap[token.text];
            } else {
                result += sql.substring(token.span.start, token.span.end);
            }
            lastEnd = token.span.end;
        }
        result += sql.substring(lastEnd);

        // Then transpile
        const transpiled = transpile(result, Dialect.Snowflake, Dialect.DuckDB);
        expect(transpiled.success).toBe(true);
        expect(transpiled.sql![0]).toContain('orders_status');
        expect(transpiled.sql![0]).not.toMatch(/\bstatus\b/);
        console.log('[Tokenizer rename + transpile]', transpiled.sql![0]);
    });
});

// ---------------------------------------------------------------------------
// transpileExploreSqlFilters integration tests
// ---------------------------------------------------------------------------
const makeDimension = (name: string, table: string): CompiledDimension => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    sql: `\${TABLE}.${name}`,
    table,
    tableLabel: table,
    hidden: false,
    compiledSql: `${table}.${table}_${name}`,
    tablesReferences: [table],
});

const makeExplore = (
    overrides: Partial<Explore> & {
        tables: Explore['tables'];
        targetDatabase: SupportedDbtAdapter;
    },
): Explore => ({
    name: 'test',
    label: 'Test',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    ...overrides,
});

const makeTable = (
    tableName: string,
    dimensionNames: string[],
    sqlWhere?: string,
): Explore['tables'][string] =>
    ({
        name: tableName,
        label: tableName,
        database: 'db',
        schema: 'public',
        sqlTable: tableName,
        dimensions: Object.fromEntries(
            dimensionNames.map((name) => [
                name,
                makeDimension(name, tableName),
            ]),
        ),
        metrics: {},
        lineageGraph: {},
        sqlWhere,
    }) as Explore['tables'][string];

describe('transpileExploreSqlFilters', () => {
    it('returns tables unchanged when no sqlWhere exists', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable('orders', ['status']),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toBeUndefined();
    });

    it('returns tables unchanged for DuckDB source (no-op)', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.DUCKDB,
            tables: {
                orders: makeTable('orders', ['status'], "status != 'returned'"),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toBe("status != 'returned'");
    });

    it('transpiles and renames columns in sql_filter', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable('orders', ['status'], "status != 'returned'"),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('orders_status');
        expect(result.orders.sqlWhere).not.toMatch(/\bstatus\b(?!_)/);
        console.log('[Renamed]', result.orders.sqlWhere);
    });

    it('renames table-qualified column references', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable(
                    'orders',
                    ['status'],
                    "${TABLE}.status != 'returned'",
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('${TABLE}');
        expect(result.orders.sqlWhere).toContain('orders_status');
        console.log('[Table-qualified rename]', result.orders.sqlWhere);
    });

    it('renames hardcoded unquoted table.column references', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable(
                    'orders',
                    ['status'],
                    "orders.status != 'returned'",
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('orders_status');
        console.log('[Hardcoded table.col]', result.orders.sqlWhere);
    });

    it('renames double-quoted "table"."column" references', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable(
                    'orders',
                    ['status'],
                    '"orders"."status" != \'returned\'',
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('orders_status');
        console.log('[Quoted "table"."col"]', result.orders.sqlWhere);
    });

    it('renames double-quoted "table".column (mixed quoting)', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable(
                    'orders',
                    ['status'],
                    '"orders".status != \'returned\'',
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('orders_status');
        console.log('[Mixed "table".col]', result.orders.sqlWhere);
    });

    it('does not rename table qualifier when table and column share a name', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable('orders', ['orders'], '"orders".orders = 1'),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        // The column "orders" should be renamed to "orders_orders"
        // but the table qualifier "orders" should stay as-is
        expect(result.orders.sqlWhere).toContain('orders_orders');
        expect(result.orders.sqlWhere).toMatch(/"orders"\./);
        console.log('[Table=column name collision]', result.orders.sqlWhere);
    });

    it('preserves Lightdash user attribute placeholders', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.POSTGRES,
            tables: {
                orders: makeTable(
                    'orders',
                    ['sales_region'],
                    'sales_region IN (${lightdash.attributes.sales_region})',
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain(
            '${lightdash.attributes.sales_region}',
        );
        expect(result.orders.sqlWhere).toContain('orders_sales_region');
        console.log('[Placeholder + rename]', result.orders.sqlWhere);
    });

    it('preserves ${ld.attr.X} shorthand placeholders', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.BIGQUERY,
            tables: {
                orders: makeTable(
                    'orders',
                    ['segment'],
                    "${ld.attr.is_admin} = 'true' OR segment != 'Enterprise'",
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('${ld.attr.is_admin}');
        expect(result.orders.sqlWhere).toContain('orders_segment');
        console.log('[Shorthand + rename]', result.orders.sqlWhere);
    });

    it('transpiles joined table sqlWhere with correct rename scope', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable('orders', ['status'], "status != 'returned'"),
                customers: makeTable(
                    'customers',
                    ['is_active'],
                    'is_active = TRUE',
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('orders_status');
        expect(result.customers.sqlWhere).toContain('customers_is_active');
        console.log('[Base table]', result.orders.sqlWhere);
        console.log('[Joined table]', result.customers.sqlWhere);
    });

    it('transpiles complex Snowflake date filter with rename', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable(
                    'orders',
                    ['created_at'],
                    "DATEDIFF('day', ${TABLE}.created_at, CURRENT_TIMESTAMP()) <= 90",
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('${TABLE}');
        expect(result.orders.sqlWhere).toContain('orders_created_at');
        expect(result.orders.sqlWhere).toContain('DATE_DIFF');
        console.log('[Snowflake date + rename]', result.orders.sqlWhere);
    });

    it('handles multiple column references in one filter', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.SNOWFLAKE,
            tables: {
                orders: makeTable(
                    'orders',
                    ['status', 'amount'],
                    "status != 'returned' AND amount > 0",
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        expect(result.orders.sqlWhere).toContain('orders_status');
        expect(result.orders.sqlWhere).toContain('orders_amount');
        console.log('[Multi-column rename]', result.orders.sqlWhere);
    });

    it('transpiles heavy Postgres sql_filter with casts, string_to_array, ANY, and user attributes', async () => {
        const explore = makeExplore({
            targetDatabase: SupportedDbtAdapter.POSTGRES,
            tables: {
                orders: makeTable(
                    'orders',
                    ['status', 'order_date', 'amount'],
                    [
                        "${TABLE}.status != 'returned'",
                        "AND ${TABLE}.status = ANY(string_to_array(${ld.attributes.statuses}, ','))",
                        "AND ${TABLE}.order_date::date >= NOW() - INTERVAL '90 days'",
                        'AND ${TABLE}.amount::numeric > 0',
                    ].join(' '),
                ),
            },
        });

        const result = await transpileExploreSqlFilters(explore);
        const sqlWhere = result.orders.sqlWhere!;

        // Placeholders preserved
        expect(sqlWhere).toContain('${TABLE}');
        expect(sqlWhere).toContain('${ld.attributes.statuses}');

        // Columns renamed to flattened pre-aggregate names
        expect(sqlWhere).toContain('orders_status');
        expect(sqlWhere).toContain('orders_order_date');
        expect(sqlWhere).toContain('orders_amount');

        // Postgres :: casts transpiled to CAST()
        expect(sqlWhere).not.toContain('::');

        console.log('[Heavy Postgres filter]', sqlWhere);
    });
});
