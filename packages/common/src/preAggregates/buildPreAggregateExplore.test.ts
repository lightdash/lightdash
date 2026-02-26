import { SupportedDbtAdapter } from '../types/dbt';
import { ExploreType, type Explore } from '../types/explore';
import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
} from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { buildPreAggregateExplore } from './buildPreAggregateExplore';

const makeDimension = ({
    name,
    table,
    type = DimensionType.STRING,
    timeInterval,
    timeIntervalBaseDimensionName,
}: {
    name: string;
    table: string;
    type?: DimensionType;
    timeInterval?: TimeFrames;
    timeIntervalBaseDimensionName?: string;
}): CompiledDimension => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `${table}.${name}`,
    hidden: false,
    compiledSql: `${table}.${name}`,
    tablesReferences: [table],
    ...(timeInterval ? { timeInterval } : {}),
    ...(timeIntervalBaseDimensionName ? { timeIntervalBaseDimensionName } : {}),
});

const makeMetric = ({
    name,
    table,
    type,
}: {
    name: string;
    table: string;
    type: MetricType;
}): CompiledMetric => ({
    index: 0,
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `${table}.${name}`,
    hidden: false,
    compiledSql: `${table}.${name}`,
    tablesReferences: [table],
});

const sourceExplore = (): Explore => ({
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [
        {
            table: 'customers',
            sqlOn: '${orders.customer_id} = ${customers.customer_id}',
            compiledSqlOn: 'orders.customer_id = customers.customer_id',
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
                order_date: makeDimension({
                    name: 'order_date',
                    table: 'orders',
                    type: DimensionType.DATE,
                }),
                order_date_hour: makeDimension({
                    name: 'order_date_hour',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.HOUR,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_day: makeDimension({
                    name: 'order_date_day',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.DAY,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
                order_date_month: makeDimension({
                    name: 'order_date_month',
                    table: 'orders',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.MONTH,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
            },
            metrics: {
                total_order_amount: makeMetric({
                    name: 'total_order_amount',
                    table: 'orders',
                    type: MetricType.SUM,
                }),
                order_count: makeMetric({
                    name: 'order_count',
                    table: 'orders',
                    type: MetricType.COUNT,
                }),
                avg_order_amount: makeMetric({
                    name: 'avg_order_amount',
                    table: 'orders',
                    type: MetricType.AVERAGE,
                }),
                custom_sql: makeMetric({
                    name: 'custom_sql',
                    table: 'orders',
                    type: MetricType.NUMBER,
                }),
            },
            lineageGraph: {},
        },
        customers: {
            name: 'customers',
            label: 'Customers',
            database: 'db',
            schema: 'public',
            sqlTable: 'customers',
            dimensions: {
                first_name: makeDimension({
                    name: 'first_name',
                    table: 'customers',
                }),
            },
            metrics: {
                max_customer_age: makeMetric({
                    name: 'max_customer_age',
                    table: 'customers',
                    type: MetricType.MAX,
                }),
            },
            lineageGraph: {},
        },
    },
    preAggregates: [
        {
            name: 'orders_rollup',
            dimensions: ['status', 'customers.first_name', 'order_date'],
            metrics: [
                'total_order_amount',
                'order_count',
                'avg_order_amount',
                'custom_sql',
                'customers.max_customer_age',
            ],
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
        },
    ],
});

describe('buildPreAggregateExplore', () => {
    it('builds a deterministic internal pre-aggregate explore', () => {
        const result = buildPreAggregateExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(result.name).toBe('__preagg__orders__orders_rollup');
        expect(result.type).toBe(ExploreType.PRE_AGGREGATE);
        expect(result.baseTable).toBe('orders');
        expect(result.joinedTables).toEqual([]);
        expect(result.preAggregates).toEqual([]);
        expect(result.tables.orders.sqlTable).toBe(
            sourceExplore().tables.orders.sqlTable,
        );
    });

    it('rewrites metrics and excludes unsupported metric types', () => {
        const result = buildPreAggregateExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(
            result.tables.orders.metrics.total_order_amount.compiledSql,
        ).toBe('SUM(orders.orders_total_order_amount)');
        expect(result.tables.orders.metrics.order_count.compiledSql).toBe(
            'SUM(orders.orders_order_count)',
        );
        expect(
            result.tables.customers.metrics.max_customer_age.compiledSql,
        ).toBe('MAX(orders.customers_max_customer_age)');

        expect(result.tables.orders.metrics.avg_order_amount).toBeUndefined();
        expect(result.tables.orders.metrics.custom_sql).toBeUndefined();
    });

    it('maps joined dimensions to materialized field-id columns', () => {
        const result = buildPreAggregateExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(result.tables.customers.dimensions.first_name.compiledSql).toBe(
            'orders.customers_first_name',
        );
    });

    it('keeps compatible time intervals and drops finer intervals than rollup granularity', () => {
        const result = buildPreAggregateExplore(
            sourceExplore(),
            sourceExplore().preAggregates![0],
        );

        expect(result.tables.orders.dimensions.order_date_day.compiledSql).toBe(
            'CAST(orders.orders_order_date_day AS TIMESTAMP)',
        );
        expect(
            result.tables.orders.dimensions.order_date_month.compiledSql,
        ).toContain('CAST(orders.orders_order_date_day AS TIMESTAMP)');
        expect(result.tables.orders.dimensions.order_date_hour).toBeUndefined();
    });

    it('uses DuckDB-compatible date truncation SQL regardless of source warehouse adapter', () => {
        const result = buildPreAggregateExplore(
            {
                ...sourceExplore(),
                targetDatabase: SupportedDbtAdapter.BIGQUERY, // doesn't matter what's the warehouse type
            },
            sourceExplore().preAggregates![0],
        );

        expect(
            result.tables.orders.dimensions.order_date_month.compiledSql,
        ).toContain(
            "DATE_TRUNC('MONTH', CAST(orders.orders_order_date_day AS TIMESTAMP))",
        );
    });

    it('throws when pre-aggregate references unknown fields', () => {
        expect(() =>
            buildPreAggregateExplore(sourceExplore(), {
                name: 'invalid_rollup',
                dimensions: ['unknown_dimension'],
                metrics: ['order_count'],
            }),
        ).toThrow('references unknown dimensions');
    });

    it('includes time dimension even when not in dimensions array', () => {
        const result = buildPreAggregateExplore(sourceExplore(), {
            name: 'time_dim_separate',
            dimensions: ['status'],
            metrics: ['order_count'],
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
        });

        expect(result.tables.orders.dimensions.order_date_day).toBeDefined();
        expect(result.tables.orders.dimensions.order_date_day.compiledSql).toBe(
            'CAST(orders.orders_order_date_day AS TIMESTAMP)',
        );
        expect(result.tables.orders.dimensions.status).toBeDefined();
    });

    it('supports legacy metric fieldIds in pre-aggregate definitions', () => {
        const result = buildPreAggregateExplore(sourceExplore(), {
            name: 'legacy_field_id_rollup',
            dimensions: ['status'],
            metrics: ['orders_order_count'],
        });

        expect(result.tables.orders.metrics.order_count).toBeDefined();
    });
});
