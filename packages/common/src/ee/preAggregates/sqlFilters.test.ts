import { SupportedDbtAdapter } from '../../types/dbt';
import { type Explore } from '../../types/explore';
import { DimensionType, FieldType } from '../../types/field';
import { TimeFrames } from '../../types/timeFrames';
import {
    getPreAggregateSqlFilterCompatibility,
    getSqlFilterDependencies,
} from './sqlFilters';

const makeDimension = ({
    name,
    table,
    sql,
    timeInterval,
    timeIntervalBaseDimensionName,
}: {
    name: string;
    table: string;
    sql?: string;
    timeInterval?: TimeFrames;
    timeIntervalBaseDimensionName?: string;
}) => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: sql ?? `\${TABLE}.${name}`,
    hidden: false,
    compiledSql: `"${table}".${name}`,
    tablesReferences: [table],
    ...(timeInterval ? { timeInterval } : {}),
    ...(timeIntervalBaseDimensionName ? { timeIntervalBaseDimensionName } : {}),
});

const getExplore = (): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [
            {
                table: 'customers',
                compiledSqlOn: '"orders".customer_id = "customers".customer_id',
                sqlOn: '${orders.customer_id} = ${customers.customer_id}',
            },
        ],
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: 'db',
                schema: 'public',
                sqlTable: 'orders',
                dimensions: {
                    status: makeDimension({ name: 'status', table: 'orders' }),
                    customer_id: makeDimension({
                        name: 'customer_id',
                        table: 'orders',
                    }),
                    order_date: makeDimension({
                        name: 'order_date',
                        table: 'orders',
                    }),
                    order_date_month: makeDimension({
                        name: 'order_date_month',
                        table: 'orders',
                        sql: "DATE_TRUNC('month', ${TABLE}.order_date)",
                        timeInterval: TimeFrames.MONTH,
                        timeIntervalBaseDimensionName: 'order_date',
                    }),
                },
                metrics: {},
                lineageGraph: {},
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
                    }),
                    segment: makeDimension({
                        name: 'segment',
                        table: 'customers',
                    }),
                },
                metrics: {},
                lineageGraph: {},
            },
        },
    }) as Explore;

describe('sqlFilters', () => {
    test('extracts `${TABLE}.column` dependencies while ignoring attribute placeholders', async () => {
        const explore = getExplore();
        explore.tables.orders.uncompiledSqlWhere =
            "${TABLE}.status != 'returned' AND ${TABLE}.status = ANY(string_to_array(${ld.attributes.statuses}, ','))";

        await expect(getSqlFilterDependencies(explore)).resolves.toEqual([
            {
                tableName: 'orders',
                reference: 'status',
                fieldId: 'orders_status',
            },
        ]);
    });

    test('extracts bare column dependencies while ignoring parameter placeholders', async () => {
        const explore = getExplore();
        explore.tables.orders.uncompiledSqlWhere =
            'customer_id = ${ld.parameters.customer_id}';

        await expect(getSqlFilterDependencies(explore)).resolves.toEqual([
            {
                tableName: 'orders',
                reference: 'customer_id',
                fieldId: 'orders_customer_id',
            },
        ]);
    });

    test('extracts joined-table dependencies from mixed raw SQL and Lightdash references', async () => {
        const explore = getExplore();
        explore.tables.orders.uncompiledSqlWhere =
            "customers.segment != 'Enterprise' AND ${customers.customer_id} IS NOT NULL";

        await expect(getSqlFilterDependencies(explore)).resolves.toEqual(
            expect.arrayContaining([
                {
                    tableName: 'customers',
                    reference: 'segment',
                    fieldId: 'customers_segment',
                },
                {
                    tableName: 'customers',
                    reference: '${customers.customer_id}',
                    fieldId: 'customers_customer_id',
                },
            ]),
        );
    });

    test('extracts raw column dependencies inside Liquid control blocks', async () => {
        const explore = getExplore();
        explore.tables.orders.uncompiledSqlWhere =
            "{% if ld.parameters.include_customer_filter %} customer_id = 1 AND customers.segment != 'Enterprise' {% endif %}";

        await expect(getSqlFilterDependencies(explore)).resolves.toEqual(
            expect.arrayContaining([
                {
                    tableName: 'orders',
                    reference: 'customer_id',
                    fieldId: 'orders_customer_id',
                },
                {
                    tableName: 'customers',
                    reference: 'segment',
                    fieldId: 'customers_segment',
                },
            ]),
        );
    });

    test('supports rolled-up time dimensions through implicit timeDimension coverage', async () => {
        const explore = getExplore();
        explore.tables.orders.uncompiledSqlWhere =
            "${order_date_month} >= DATE_TRUNC('month', CURRENT_DATE)";

        await expect(
            getPreAggregateSqlFilterCompatibility({
                explore,
                preAggregateDef: {
                    name: 'orders_daily',
                    dimensions: ['status'],
                    metrics: [],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            }),
        ).resolves.toEqual({
            supported: true,
            dependencies: [
                {
                    tableName: 'orders',
                    reference: '${order_date_month}',
                    fieldId: 'orders_order_date_month',
                },
            ],
        });
    });

    test('returns unsupported when sql_filter requires an unmaterialized base-table column', async () => {
        const explore = getExplore();
        explore.tables.orders.uncompiledSqlWhere =
            'customer_id = ${ld.parameters.customer_id}';

        await expect(
            getPreAggregateSqlFilterCompatibility({
                explore,
                preAggregateDef: {
                    name: 'orders_daily',
                    dimensions: ['status'],
                    metrics: [],
                },
            }),
        ).resolves.toEqual({
            supported: false,
            dependency: {
                tableName: 'orders',
                reference: 'customer_id',
                fieldId: 'orders_customer_id',
            },
            dependencies: [
                {
                    tableName: 'orders',
                    reference: 'customer_id',
                    fieldId: 'orders_customer_id',
                },
            ],
        });
    });

    test('returns unsupported when sql_filter requires an unmaterialized joined-table column', async () => {
        const explore = getExplore();
        explore.tables.orders.uncompiledSqlWhere = "customers.segment != 'SMB'";

        await expect(
            getPreAggregateSqlFilterCompatibility({
                explore,
                preAggregateDef: {
                    name: 'orders_daily',
                    dimensions: ['status', 'customer_id'],
                    metrics: [],
                },
            }),
        ).resolves.toEqual({
            supported: false,
            dependency: {
                tableName: 'customers',
                reference: 'segment',
                fieldId: 'customers_segment',
            },
            dependencies: [
                {
                    tableName: 'customers',
                    reference: 'segment',
                    fieldId: 'customers_segment',
                },
            ],
        });
    });
});
