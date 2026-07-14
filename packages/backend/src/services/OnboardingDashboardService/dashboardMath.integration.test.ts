// Executes generated KPI chart queries through MetricQueryBuilder against the seeded PostgreSQL fixture.
import {
    DimensionType,
    ExploreCompiler,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type Explore,
    type SemanticLayerResult,
    type Table,
} from '@lightdash/common';
import { PostgresSqlBuilder } from '@lightdash/warehouses';
import knex, { type Knex } from 'knex';
import { compileMetricQuery } from '../../queryCompiler';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { buildDashboardTemplate } from './dashboardTemplate';

const schemaName = 'onboarding_dashboard_math';
const warehouseSqlBuilder = new PostgresSqlBuilder();
let db: Knex;
let explore: Explore;

const ordersTable: Table = {
    name: 'orders',
    label: 'Orders',
    database: '',
    schema: schemaName,
    sqlTable: `"${schemaName}"."orders"`,
    dimensions: {
        order_id: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.NUMBER,
            name: 'order_id',
            label: 'Order id',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}."order_id"',
            hidden: false,
        },
        customer_id: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'customer_id',
            label: 'Customer id',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}."customer_id"',
            hidden: false,
        },
        revenue: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.NUMBER,
            name: 'revenue',
            label: 'Revenue',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}."revenue"',
            hidden: false,
        },
        created_at: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.TIMESTAMP,
            name: 'created_at',
            label: 'Created at',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}."created_at"',
            hidden: false,
            isIntervalBase: true,
        },
        created_at_month: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.DATE,
            name: 'created_at_month',
            label: 'Created at month',
            table: 'orders',
            tableLabel: 'Orders',
            sql: 'DATE_TRUNC(\'month\', ${TABLE}."created_at")',
            hidden: false,
            isIntervalBase: false,
        },
        channel: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'channel',
            label: 'Channel',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}."channel"',
            hidden: false,
        },
    },
    metrics: {
        total_revenue: {
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name: 'total_revenue',
            label: 'Total revenue',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${orders.revenue}',
            hidden: false,
        },
        orders_count: {
            fieldType: FieldType.METRIC,
            type: MetricType.COUNT,
            name: 'orders_count',
            label: 'Orders count',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${orders.order_id}',
            hidden: false,
        },
        avg_revenue: {
            fieldType: FieldType.METRIC,
            type: MetricType.AVERAGE,
            name: 'avg_revenue',
            label: 'Avg revenue',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${orders.revenue}',
            hidden: false,
        },
        unique_customer_id: {
            fieldType: FieldType.METRIC,
            type: MetricType.COUNT_DISTINCT,
            name: 'unique_customer_id',
            label: 'Unique customers',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${orders.customer_id}',
            hidden: false,
        },
    },
    lineageGraph: {},
};

const semanticLayer: SemanticLayerResult = {
    primaryExploreName: 'orders',
    explores: [
        {
            name: 'orders',
            label: 'Orders',
            baseTable: 'orders',
            metrics: [
                {
                    fieldId: 'orders_total_revenue',
                    name: 'total_revenue',
                    label: 'Total revenue',
                    type: MetricType.SUM,
                    source: { table: 'orders', column: 'revenue' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_orders_count',
                    name: 'orders_count',
                    label: 'Orders count',
                    type: MetricType.COUNT,
                    source: { table: 'orders', column: 'order_id' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_avg_revenue',
                    name: 'avg_revenue',
                    label: 'Avg revenue',
                    type: MetricType.AVERAGE,
                    source: { table: 'orders', column: 'revenue' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_unique_customer_id',
                    name: 'unique_customer_id',
                    label: 'Unique customers',
                    type: MetricType.COUNT_DISTINCT,
                    source: { table: 'orders', column: 'customer_id' },
                    hidden: false,
                },
            ],
            dimensions: [
                {
                    fieldId: 'orders_created_at',
                    name: 'created_at',
                    label: 'Created at',
                    type: DimensionType.TIMESTAMP,
                    source: { table: 'orders', column: 'created_at' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_created_at_month',
                    name: 'created_at_month',
                    label: 'Created at month',
                    type: DimensionType.DATE,
                    source: { table: 'orders', column: 'created_at' },
                    hidden: false,
                },
                {
                    fieldId: 'orders_channel',
                    name: 'channel',
                    label: 'Channel',
                    type: DimensionType.STRING,
                    source: { table: 'orders', column: 'channel' },
                    hidden: false,
                },
            ],
            joins: [],
        },
    ],
    skippedTableCount: 0,
    validationErrors: [],
    generatedAt: '2026-07-13T12:00:00.000Z',
};

beforeAll(async () => {
    const connection = process.env.PGCONNECTIONURI;
    if (!connection) {
        throw new Error(
            'PGCONNECTIONURI environment variable is required for integration tests',
        );
    }
    db = knex({ client: 'pg', connection });
    await db.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await db.raw(`CREATE SCHEMA "${schemaName}"`);
    await db.schema.withSchema(schemaName).createTable('orders', (table) => {
        table.integer('order_id').notNullable();
        table.string('customer_id').notNullable();
        table.timestamp('created_at', { useTz: true }).notNullable();
        table.decimal('revenue', 12, 2).notNullable();
        table.string('channel').notNullable();
    });
    await db
        .withSchema(schemaName)
        .table('orders')
        .insert([
            {
                order_id: 1,
                customer_id: 'customer_1',
                created_at: '2026-02-01T00:00:00.000Z',
                revenue: 100,
                channel: 'web',
            },
            {
                order_id: 2,
                customer_id: 'customer_2',
                created_at: '2026-02-02T00:00:00.000Z',
                revenue: 50,
                channel: 'web',
            },
            {
                order_id: 3,
                customer_id: 'customer_3',
                created_at: '2026-02-03T00:00:00.000Z',
                revenue: 50,
                channel: 'web',
            },
            {
                order_id: 4,
                customer_id: 'customer_1',
                created_at: '2026-02-04T00:00:00.000Z',
                revenue: 200,
                channel: 'store',
            },
            {
                order_id: 5,
                customer_id: 'customer_2',
                created_at: '2026-02-05T00:00:00.000Z',
                revenue: 100,
                channel: 'store',
            },
            {
                order_id: 6,
                customer_id: 'customer_1',
                created_at: '2026-01-01T00:00:00.000Z',
                revenue: 80,
                channel: 'web',
            },
            {
                order_id: 7,
                customer_id: 'customer_1',
                created_at: '2026-01-02T00:00:00.000Z',
                revenue: 20,
                channel: 'store',
            },
            {
                order_id: 8,
                customer_id: 'customer_4',
                created_at: '2026-01-03T00:00:00.000Z',
                revenue: 100,
                channel: 'web',
            },
            {
                order_id: 9,
                customer_id: 'customer_4',
                created_at: '2026-01-04T00:00:00.000Z',
                revenue: 100,
                channel: 'store',
            },
        ]);
    explore = new ExploreCompiler(warehouseSqlBuilder).compileExplore({
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [],
        tables: { orders: ordersTable },
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        meta: {},
    });
});

afterAll(async () => {
    if (!db) return;
    await db.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await db.destroy();
});

const compileChartQuery = (
    chart: ReturnType<typeof buildDashboardTemplate>['charts'][number],
): string => {
    const compiledMetricQuery = compileMetricQuery({
        explore,
        metricQuery: chart.metricQuery,
        warehouseSqlBuilder,
        availableParameters: [],
    });
    return new MetricQueryBuilder({
        explore,
        compiledMetricQuery,
        warehouseSqlBuilder,
        userAttributes: {},
        parameterDefinitions: {},
        intrinsicUserAttributes: {},
        timezone: 'UTC',
    }).compileQuery().query;
};

describe('onboarding dashboard generated KPI math', () => {
    it('preserves additive and non-additive metric semantics in the query layer', async () => {
        const { charts } = buildDashboardTemplate(semanticLayer);
        const expectations = new Map([
            ['Total revenue', ['orders_total_revenue', 500]],
            ['Orders', ['orders_orders_count', 5]],
            ['Avg order value', ['orders_avg_revenue', 100]],
            ['Unique customers', ['orders_unique_customer_id', 3]],
        ] as const);

        await Promise.all(
            [...expectations].map(
                async ([chartName, [fieldId, expectedValue]]) => {
                    const chart = charts.find(
                        (candidate) => candidate.name === chartName,
                    );
                    if (!chart) {
                        throw new Error(`Missing generated chart ${chartName}`);
                    }
                    const sql = compileChartQuery(chart);
                    const result = await db.raw(sql);
                    expect(Number(result.rows[0][fieldId])).toBe(expectedValue);
                    expect(chart.metricQuery.tableCalculations).toEqual([]);
                },
            ),
        );

        const uniqueCustomersChart = charts.find(
            (chart) => chart.name === 'Unique customers',
        );
        const averageChart = charts.find(
            (chart) => chart.name === 'Avg order value',
        );
        if (!uniqueCustomersChart || !averageChart) {
            throw new Error('Expected generated non-additive KPI charts');
        }
        expect(compileChartQuery(uniqueCustomersChart)).toContain(
            'COUNT(DISTINCT',
        );
        expect(compileChartQuery(averageChart)).toContain('AVG(');
    });
});
