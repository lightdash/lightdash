import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type ItemsMap,
} from '@lightdash/common';
import {
    redactExploreSql,
    redactItemsMapSql,
    resolveAdditionalMetricsSql,
} from './embedCompiledSql';

const dimension: CompiledDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'amount',
    label: 'Amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    compiledSql: '"orders".amount',
    tablesReferences: ['orders'],
    hidden: false,
};

const metric: CompiledMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM_DISTINCT,
    name: 'total',
    label: 'Total',
    description: 'Total order value',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    compiledSql: 'SUM("orders".amount)',
    compiledValueSql: '"orders".amount',
    compiledDistinctKeys: ['"orders".id'],
    tablesReferences: ['orders'],
    hidden: false,
};

const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    joinedTables: [
        {
            table: 'customers',
            sqlOn: '${orders.customer_id} = ${customers.id}',
            compiledSqlOn: '"orders".customer_id = "customers".id',
        },
    ],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: '"db"."public"."orders"',
            sqlWhere: '"orders".deleted = false',
            uncompiledSqlWhere: '${TABLE}.deleted = false',
            dimensions: { amount: dimension },
            metrics: { total: metric },
            lineageGraph: {},
        },
    },
};

describe('redactExploreSql', () => {
    it('strips table, join and field SQL while keeping labels and descriptions', () => {
        const redacted = redactExploreSql(explore);
        const table = redacted.tables.orders;

        expect(table.sqlTable).toBe('');
        expect(table.sqlWhere).toBeUndefined();
        expect(table.uncompiledSqlWhere).toBeUndefined();
        expect(redacted.joinedTables[0]).toMatchObject({
            sqlOn: '',
            compiledSqlOn: '',
        });
        expect(table.dimensions.amount).toMatchObject({
            sql: '',
            compiledSql: '',
            label: 'Amount',
        });
        expect(table.metrics.total).toMatchObject({
            sql: '',
            compiledSql: '',
            compiledValueSql: undefined,
            compiledDistinctKeys: undefined,
            description: 'Total order value',
        });
    });
});

describe('redactItemsMapSql', () => {
    it('strips field SQL and leaves chart-authored items untouched', () => {
        const tableCalculation = {
            name: 'double_total',
            displayName: 'Double total',
            sql: '${orders.total} * 2',
        };
        const itemsMap: ItemsMap = {
            orders_total: metric,
            double_total: tableCalculation,
        };

        const redacted = redactItemsMapSql(itemsMap);

        expect(redacted.orders_total).toMatchObject({
            sql: '',
            compiledSql: '',
        });
        expect(redacted.double_total).toBe(tableCalculation);
    });
});

describe('resolveAdditionalMetricsSql', () => {
    const { tables } = explore;

    it('takes SQL from the base dimension when the custom metric has none', () => {
        const [resolved] = resolveAdditionalMetricsSql(
            [
                {
                    name: 'avg_amount',
                    table: 'orders',
                    type: MetricType.AVERAGE,
                    sql: '',
                    baseDimensionName: 'amount',
                },
            ],
            tables,
        );

        expect(resolved.sql).toBe('${TABLE}.amount');
    });

    it('takes SQL from the base metric for period-over-period metrics', () => {
        const [resolved] = resolveAdditionalMetricsSql(
            [
                {
                    name: 'total_previous',
                    table: 'orders',
                    type: MetricType.SUM_DISTINCT,
                    sql: '',
                    generationType: 'periodOverPeriod',
                    baseMetricId: 'orders_total',
                    timeDimensionId: 'orders_created_at',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 1,
                },
            ],
            tables,
        );

        expect(resolved.sql).toBe('${TABLE}.amount');
    });

    it('keeps existing SQL and leaves unresolvable metrics empty', () => {
        const resolved = resolveAdditionalMetricsSql(
            [
                {
                    name: 'custom',
                    table: 'orders',
                    type: MetricType.SUM,
                    sql: '${TABLE}.other',
                    baseDimensionName: 'amount',
                },
                {
                    name: 'unknown',
                    table: 'orders',
                    type: MetricType.SUM,
                    sql: '',
                    baseDimensionName: 'missing',
                },
            ],
            tables,
        );

        expect(resolved.map((m) => m.sql)).toEqual(['${TABLE}.other', '']);
    });
});
