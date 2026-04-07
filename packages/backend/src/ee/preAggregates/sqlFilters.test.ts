import {
    DimensionType,
    ExploreType,
    FieldType,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { rebuildAndTranspilePreAggregateSqlFilters } from './sqlFilters';

const makeDimension = ({
    name,
    table,
    sql,
    compiledSql,
}: {
    name: string;
    table: string;
    sql: string;
    compiledSql: string;
}) => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table,
    tableLabel: table,
    sql,
    hidden: false,
    compiledSql,
    tablesReferences: [table],
});

const getSourceExplore = (
    targetDatabase: SupportedDbtAdapter = SupportedDbtAdapter.POSTGRES,
): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [
            {
                table: 'customers',
                sqlOn: '${orders.customer_id} = ${customers.customer_id}',
                compiledSqlOn: '"orders".customer_id = "customers".customer_id',
            },
        ],
        targetDatabase,
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: 'db',
                schema: 'public',
                sqlTable: 'orders',
                dimensions: {
                    status: makeDimension({
                        name: 'status',
                        table: 'orders',
                        sql: '${TABLE}.status',
                        compiledSql: '"orders".status',
                    }),
                    customer_id: makeDimension({
                        name: 'customer_id',
                        table: 'orders',
                        sql: '${TABLE}.customer_id',
                        compiledSql: '"orders".customer_id',
                    }),
                    order_date: makeDimension({
                        name: 'order_date',
                        table: 'orders',
                        sql: '${TABLE}.order_date',
                        compiledSql: '"orders".order_date',
                    }),
                },
                metrics: {},
                lineageGraph: {},
                uncompiledSqlWhere:
                    "${TABLE}.status != 'returned' AND customer_id = ${ld.parameters.customer_id} AND customers.segment != 'Enterprise'",
            },
            customers: {
                name: 'customers',
                label: 'Customers',
                database: 'db',
                schema: 'public',
                sqlTable: 'customers',
                dimensions: {
                    customer_id: makeDimension({
                        name: 'customer_id',
                        table: 'customers',
                        sql: '${TABLE}.customer_id',
                        compiledSql: '"customers".customer_id',
                    }),
                    segment: makeDimension({
                        name: 'segment',
                        table: 'customers',
                        sql: '${TABLE}.segment',
                        compiledSql: '"customers".segment',
                    }),
                },
                metrics: {},
                lineageGraph: {},
            },
        },
    }) as Explore;

const getPreAggregateExplore = (
    targetDatabase: SupportedDbtAdapter = SupportedDbtAdapter.POSTGRES,
): Explore =>
    ({
        ...getSourceExplore(targetDatabase),
        name: '__preagg__orders__orders_rollup',
        type: ExploreType.PRE_AGGREGATE,
        preAggregateSource: {
            sourceExploreName: 'orders',
            preAggregateName: 'orders_rollup',
        },
        tables: {
            orders: {
                ...getSourceExplore(targetDatabase).tables.orders,
                dimensions: {
                    status: makeDimension({
                        name: 'status',
                        table: 'orders',
                        sql: 'orders.orders_status',
                        compiledSql: 'orders.orders_status',
                    }),
                    customer_id: makeDimension({
                        name: 'customer_id',
                        table: 'orders',
                        sql: 'orders.orders_customer_id',
                        compiledSql: 'orders.orders_customer_id',
                    }),
                    order_date: makeDimension({
                        name: 'order_date',
                        table: 'orders',
                        sql: 'CAST(orders.orders_order_date_day AS TIMESTAMP)',
                        compiledSql:
                            'CAST(orders.orders_order_date_day AS TIMESTAMP)',
                    }),
                },
            },
            customers: {
                ...getSourceExplore(targetDatabase).tables.customers,
                dimensions: {
                    customer_id: makeDimension({
                        name: 'customer_id',
                        table: 'customers',
                        sql: 'orders.customers_customer_id',
                        compiledSql: 'orders.customers_customer_id',
                    }),
                    segment: makeDimension({
                        name: 'segment',
                        table: 'customers',
                        sql: 'orders.customers_segment',
                        compiledSql: 'orders.customers_segment',
                    }),
                },
            },
        },
    }) as Explore;

describe('rebuildAndTranspilePreAggregateSqlFilters', () => {
    test('rebuilds sqlWhere against the pre-aggregate explore and preserves placeholders', async () => {
        const sourceExplore = getSourceExplore();
        const preAggExplore = getPreAggregateExplore();

        const result = await rebuildAndTranspilePreAggregateSqlFilters({
            sourceExplore,
            preAggExplore,
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                sourceExplore.targetDatabase,
            ),
        });

        expect(result.orders.sqlWhere).toContain('orders.orders_status');
        expect(result.orders.sqlWhere).toContain('orders.orders_customer_id');
        expect(result.orders.sqlWhere).toContain('orders.customers_segment');
        expect(result.orders.sqlWhere).toContain(
            '${ld.parameters.customer_id}',
        );
        expect(result.orders.sqlWhere).not.toContain('"orders".status');
        expect(result.orders.sqlWhere).not.toContain('"orders".customer_id');
    });

    test('transpiles source-dialect sql to DuckDB after rebuilding', async () => {
        const sourceExplore = getSourceExplore();
        sourceExplore.tables.orders.uncompiledSqlWhere =
            "${order_date}::date >= NOW() - INTERVAL '7 days'";
        const preAggExplore = getPreAggregateExplore();

        const result = await rebuildAndTranspilePreAggregateSqlFilters({
            sourceExplore,
            preAggExplore,
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                sourceExplore.targetDatabase,
            ),
        });

        expect(result.orders.sqlWhere).toContain(
            'CAST(orders.orders_order_date_day AS TIMESTAMP)',
        );
        expect(result.orders.sqlWhere).not.toContain('::date');
    });

    test('still rewrites raw columns when the source dialect is already DuckDB', async () => {
        const sourceExplore = getSourceExplore(SupportedDbtAdapter.DUCKDB);
        const preAggExplore = getPreAggregateExplore(
            SupportedDbtAdapter.DUCKDB,
        );

        const result = await rebuildAndTranspilePreAggregateSqlFilters({
            sourceExplore,
            preAggExplore,
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                sourceExplore.targetDatabase,
            ),
        });

        expect(result.orders.sqlWhere).toContain('orders.orders_status');
        expect(result.orders.sqlWhere).toContain('orders.orders_customer_id');
        expect(result.orders.sqlWhere).not.toContain('.status');
    });

    test('rewrites raw bare and qualified references without throwing', async () => {
        const sourceExplore = getSourceExplore();
        sourceExplore.tables.orders.uncompiledSqlWhere =
            "customer_id = 1 AND customers.segment != 'Enterprise'";
        const preAggExplore = getPreAggregateExplore();

        const result = await rebuildAndTranspilePreAggregateSqlFilters({
            sourceExplore,
            preAggExplore,
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                sourceExplore.targetDatabase,
            ),
        });

        expect(result.orders.sqlWhere).toContain('orders.orders_customer_id');
        expect(result.orders.sqlWhere).toContain('orders.customers_segment');
        expect(result.orders.sqlWhere).not.toContain('customer_id = 1');
        expect(result.orders.sqlWhere).not.toContain('customers.segment');
    });
});
