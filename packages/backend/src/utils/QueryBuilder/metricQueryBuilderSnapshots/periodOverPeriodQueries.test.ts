import {
    CompiledMetricQuery,
    DimensionType,
    Explore,
    FieldType,
    FilterOperator,
    JoinRelationship,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
} from '@lightdash/common';
import { buildQuery } from './helpers';

const POP_TEST_POP_METRIC_NAME = 'total_order_amount__pop__year_1__snapshot';
const POP_TEST_POP_METRIC_ID = `orders_${POP_TEST_POP_METRIC_NAME}`;

const POP_TEST_EXPLORE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'orders',
    baseTable: 'orders',
    tags: [],
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'orders',
            database: 'postgres',
            schema: 'jaffle',
            sqlTable: '"postgres"."jaffle"."orders"',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    type: DimensionType.NUMBER,
                    name: 'order_id',
                    label: 'order_id',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"orders".order_id',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                order_date: {
                    type: DimensionType.DATE,
                    name: 'order_date',
                    label: 'order_date',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_date',
                    compiledSql: '"orders".order_date',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
                order_date_year: {
                    type: DimensionType.DATE,
                    name: 'order_date_year',
                    label: 'order_date_year',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: "DATE_TRUNC('YEAR', ${TABLE}.order_date)",
                    compiledSql: `DATE_TRUNC('YEAR', "orders".order_date)`,
                    tablesReferences: ['orders'],
                    hidden: false,
                    timeInterval: TimeFrames.YEAR,
                    timeIntervalBaseDimensionName: 'order_date',
                },
                is_completed: {
                    type: DimensionType.BOOLEAN,
                    name: 'is_completed',
                    label: 'is_completed',
                    table: 'orders',
                    tableLabel: 'orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.is_completed',
                    compiledSql: '"orders".is_completed',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_order_amount: {
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'orders',
                    name: 'total_order_amount',
                    label: 'total_order_amount',
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("orders".amount)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

const POP_TEST_METRIC_QUERY: CompiledMetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_year'],
    metrics: ['orders_total_order_amount', POP_TEST_POP_METRIC_ID],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'is-completed',
                    target: {
                        fieldId: 'orders_is_completed',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [true],
                },
                {
                    id: 'base-year',
                    target: {
                        fieldId: 'orders_order_date_year',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['2025-01-01'],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'orders_order_date_year', descending: true }],
    limit: 500,
    tableCalculations: [],
    compiledTableCalculations: [],
    additionalMetrics: [
        {
            table: 'orders',
            name: POP_TEST_POP_METRIC_NAME,
            label: 'Previous year total_order_amount',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            generationType: 'periodOverPeriod' as const,
            baseMetricId: 'orders_total_order_amount',
            timeDimensionId: 'orders_order_date_year',
            granularity: TimeFrames.YEAR,
            periodOffset: 1,
        },
    ],
    compiledAdditionalMetrics: [
        {
            type: MetricType.SUM,
            fieldType: FieldType.METRIC,
            table: 'orders',
            tableLabel: 'orders',
            name: POP_TEST_POP_METRIC_NAME,
            label: 'Previous year total_order_amount',
            sql: '${TABLE}.amount',
            compiledSql: 'SUM("orders".amount)',
            tablesReferences: ['orders'],
            hidden: true,
        },
    ],
    compiledCustomDimensions: [],
};

const POP_TEST_FANOUT_POP_METRIC_NAME = 'metric_amount__pop__year_1__fanout';
const POP_TEST_FANOUT_POP_METRIC_ID = `table2_${POP_TEST_FANOUT_POP_METRIC_NAME}`;

const POP_TEST_FANOUT_EXPLORE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'base',
    label: 'base',
    baseTable: 'table1',
    tags: [],
    joinedTables: [
        {
            table: 'table2',
            sqlOn: '${table1.shared} = ${table2.shared}',
            compiledSqlOn: '("table1".shared) = ("table2".shared)',
            type: undefined,
            tablesReferences: ['table1', 'table2'],
            relationship: JoinRelationship.MANY_TO_ONE,
        },
    ],
    tables: {
        table1: {
            name: 'table1',
            label: 'table1',
            database: 'database',
            schema: 'schema',
            sqlTable: '"db"."schema"."table1"',
            primaryKey: ['id'],
            dimensions: {
                id: {
                    type: DimensionType.NUMBER,
                    name: 'id',
                    label: 'id',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.id',
                    compiledSql: '"table1".id',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
                shared: {
                    type: DimensionType.STRING,
                    name: 'shared',
                    label: 'shared',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.shared',
                    compiledSql: '"table1".shared',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
            metrics: {},
            lineageGraph: {},
        },
        table2: {
            name: 'table2',
            label: 'table2',
            database: 'database',
            schema: 'schema',
            sqlTable: '"db"."schema"."table2"',
            primaryKey: ['id'],
            dimensions: {
                id: {
                    type: DimensionType.NUMBER,
                    name: 'id',
                    label: 'id',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.id',
                    compiledSql: '"table2".id',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
                shared: {
                    type: DimensionType.STRING,
                    name: 'shared',
                    label: 'shared',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.shared',
                    compiledSql: '"table2".shared',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
                order_date: {
                    type: DimensionType.DATE,
                    name: 'order_date',
                    label: 'order_date',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_date',
                    compiledSql: '"table2".order_date',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
                order_date_year: {
                    type: DimensionType.DATE,
                    name: 'order_date_year',
                    label: 'order_date_year',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: "DATE_TRUNC('YEAR', ${TABLE}.order_date)",
                    compiledSql: `DATE_TRUNC('YEAR', "table2".order_date)`,
                    tablesReferences: ['table2'],
                    hidden: false,
                    timeInterval: TimeFrames.YEAR,
                    timeIntervalBaseDimensionName: 'order_date',
                },
                is_completed: {
                    type: DimensionType.BOOLEAN,
                    name: 'is_completed',
                    label: 'is_completed',
                    table: 'table2',
                    tableLabel: 'table2',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.is_completed',
                    compiledSql: '"table2".is_completed',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
            },
            metrics: {
                metric_amount: {
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'table2',
                    tableLabel: 'table2',
                    name: 'metric_amount',
                    label: 'metric_amount',
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("table2".amount)',
                    tablesReferences: ['table2'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

const POP_TEST_FANOUT_METRIC_QUERY: CompiledMetricQuery = {
    exploreName: 'base',
    dimensions: ['table2_order_date_year'],
    metrics: ['table2_metric_amount', POP_TEST_FANOUT_POP_METRIC_ID],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'is-completed',
                    target: {
                        fieldId: 'table2_is_completed',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [true],
                },
                {
                    id: 'base-year',
                    target: {
                        fieldId: 'table2_order_date_year',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['2025-01-01'],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table2_order_date_year', descending: true }],
    limit: 100,
    tableCalculations: [],
    compiledTableCalculations: [],
    additionalMetrics: [
        {
            table: 'table2',
            name: POP_TEST_FANOUT_POP_METRIC_NAME,
            label: 'Previous year metric_amount',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            generationType: 'periodOverPeriod' as const,
            baseMetricId: 'table2_metric_amount',
            timeDimensionId: 'table2_order_date_year',
            granularity: TimeFrames.YEAR,
            periodOffset: 1,
        },
    ],
    compiledAdditionalMetrics: [
        {
            type: MetricType.SUM,
            fieldType: FieldType.METRIC,
            table: 'table2',
            tableLabel: 'table2',
            name: POP_TEST_FANOUT_POP_METRIC_NAME,
            label: 'Previous year metric_amount',
            sql: '${TABLE}.amount',
            compiledSql: 'SUM("table2".amount)',
            tablesReferences: ['table2'],
            hidden: true,
        },
    ],
    compiledCustomDimensions: [],
};

const POP_TEST_COUNTRY_FANOUT_POP_METRIC_NAME =
    'total_order_amount__pop__year_1__country';
const POP_TEST_COUNTRY_FANOUT_POP_METRIC_ID = `country_orders_${POP_TEST_COUNTRY_FANOUT_POP_METRIC_NAME}`;

const POP_TEST_COUNTRY_FANOUT_EXPLORE: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'country_orders',
    label: 'country_orders',
    baseTable: 'country_orders',
    tags: [],
    joinedTables: [
        {
            table: 'order_currencies',
            sqlOn: '${country_orders.order_id} = ${order_currencies.order_id}',
            compiledSqlOn:
                '("country_orders".order_id) = ("order_currencies".order_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_MANY,
            tablesReferences: ['country_orders', 'order_currencies'],
        },
    ],
    tables: {
        country_orders: {
            name: 'country_orders',
            label: 'country_orders',
            database: 'postgres',
            schema: 'jaffle',
            sqlTable: '"postgres"."jaffle"."country_orders"',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    type: DimensionType.NUMBER,
                    name: 'order_id',
                    label: 'order_id',
                    table: 'country_orders',
                    tableLabel: 'country_orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"country_orders".order_id',
                    tablesReferences: ['country_orders'],
                    hidden: false,
                },
                order_date: {
                    type: DimensionType.DATE,
                    name: 'order_date',
                    label: 'order_date',
                    table: 'country_orders',
                    tableLabel: 'country_orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_date',
                    compiledSql: '"country_orders".order_date',
                    tablesReferences: ['country_orders'],
                    hidden: false,
                },
                order_date_year: {
                    type: DimensionType.DATE,
                    name: 'order_date_year',
                    label: 'order_date_year',
                    table: 'country_orders',
                    tableLabel: 'country_orders',
                    fieldType: FieldType.DIMENSION,
                    sql: "DATE_TRUNC('YEAR', ${TABLE}.order_date)",
                    compiledSql: `DATE_TRUNC('YEAR', "country_orders".order_date)`,
                    tablesReferences: ['country_orders'],
                    hidden: false,
                    timeInterval: TimeFrames.YEAR,
                    timeIntervalBaseDimensionName: 'order_date',
                },
                country: {
                    type: DimensionType.STRING,
                    name: 'country',
                    label: 'country',
                    table: 'country_orders',
                    tableLabel: 'country_orders',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.country',
                    compiledSql: '"country_orders".country',
                    tablesReferences: ['country_orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_order_amount: {
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'country_orders',
                    tableLabel: 'country_orders',
                    name: 'total_order_amount',
                    label: 'total_order_amount',
                    sql: '${TABLE}.amount',
                    compiledSql: 'SUM("country_orders".amount)',
                    tablesReferences: ['country_orders'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
        order_currencies: {
            name: 'order_currencies',
            label: 'order_currencies',
            database: 'postgres',
            schema: 'jaffle',
            sqlTable: '"postgres"."jaffle"."order_currencies"',
            primaryKey: ['order_id'],
            dimensions: {
                order_id: {
                    type: DimensionType.NUMBER,
                    name: 'order_id',
                    label: 'order_id',
                    table: 'order_currencies',
                    tableLabel: 'order_currencies',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.order_id',
                    compiledSql: '"order_currencies".order_id',
                    tablesReferences: ['order_currencies'],
                    hidden: false,
                },
                currency: {
                    type: DimensionType.STRING,
                    name: 'currency',
                    label: 'currency',
                    table: 'order_currencies',
                    tableLabel: 'order_currencies',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.currency',
                    compiledSql: '"order_currencies".currency',
                    tablesReferences: ['order_currencies'],
                    hidden: false,
                },
            },
            metrics: {
                total_converted_amount: {
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'order_currencies',
                    tableLabel: 'order_currencies',
                    name: 'total_converted_amount',
                    label: 'total_converted_amount',
                    sql: '${TABLE}.converted_amount',
                    compiledSql: 'SUM("order_currencies".converted_amount)',
                    tablesReferences: ['order_currencies'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

const POP_TEST_COUNTRY_FANOUT_METRIC_QUERY: CompiledMetricQuery = {
    exploreName: 'country_orders',
    dimensions: [
        'country_orders_order_date_year',
        'country_orders_country',
        'order_currencies_currency',
    ],
    metrics: [
        'country_orders_total_order_amount',
        POP_TEST_COUNTRY_FANOUT_POP_METRIC_ID,
    ],
    filters: {},
    sorts: [{ fieldId: 'country_orders_order_date_year', descending: true }],
    limit: 100,
    tableCalculations: [],
    compiledTableCalculations: [],
    additionalMetrics: [
        {
            table: 'country_orders',
            name: POP_TEST_COUNTRY_FANOUT_POP_METRIC_NAME,
            label: 'Previous year total_order_amount',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            generationType: 'periodOverPeriod' as const,
            baseMetricId: 'country_orders_total_order_amount',
            timeDimensionId: 'country_orders_order_date_year',
            granularity: TimeFrames.YEAR,
            periodOffset: 1,
        },
    ],
    compiledAdditionalMetrics: [
        {
            type: MetricType.SUM,
            fieldType: FieldType.METRIC,
            table: 'country_orders',
            tableLabel: 'country_orders',
            name: POP_TEST_COUNTRY_FANOUT_POP_METRIC_NAME,
            label: 'Previous year total_order_amount',
            sql: '${TABLE}.amount',
            compiledSql: 'SUM("country_orders".amount)',
            tablesReferences: ['country_orders'],
            hidden: true,
        },
    ],
    compiledCustomDimensions: [],
};

describe('MetricQueryBuilder snapshot: period-over-period queries', () => {
    // Mirrors period-over-period dashboard tiles on yearly time grains,
    // including the shifted comparison window and LEFT JOIN merge back to base metrics.
    test('matches snapshot for a period-over-period query', () => {
        expect(
            buildQuery({
                explore: POP_TEST_EXPLORE,
                compiledMetricQuery: POP_TEST_METRIC_QUERY,
            }),
        ).toMatchSnapshot();
    });

    // Covers the base PoP path when the user only filters the current-period time dimension,
    // so the comparison CTE must derive its shifted range without carrying the raw date predicate through.
    test('matches snapshot for a period-over-period query with only a date filter', () => {
        expect(
            buildQuery({
                explore: POP_TEST_EXPLORE,
                compiledMetricQuery: {
                    ...POP_TEST_METRIC_QUERY,
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                {
                                    id: 'base-year',
                                    target: {
                                        fieldId: 'orders_order_date_year',
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: ['2025-01-01'],
                                },
                            ],
                        },
                    },
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers the base PoP path with no filters at all,
    // ensuring the comparison period is merged back with a LEFT JOIN while preserving all base rows.
    test('matches snapshot for a period-over-period query without filters', () => {
        expect(
            buildQuery({
                explore: POP_TEST_EXPLORE,
                compiledMetricQuery: {
                    ...POP_TEST_METRIC_QUERY,
                    filters: {},
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers the fanout-protected PoP path where the compared metric lives on a joined table,
    // forcing keyed CTEs before the shifted comparison range can be computed and joined back.
    test('matches snapshot for a fanout-protected period-over-period query', () => {
        expect(
            buildQuery({
                explore: POP_TEST_FANOUT_EXPLORE,
                compiledMetricQuery: POP_TEST_FANOUT_METRIC_QUERY,
            }),
        ).toMatchSnapshot();
    });

    // Covers the true one-to-many fanout PoP path, where the base metric lives on the base table
    // but a joined-table dimension forces keyed fanout CTEs and a LEFT JOIN merge back to all base rows.
    test('matches snapshot for a one-to-many fanout-protected period-over-period query', () => {
        expect(
            buildQuery({
                explore: POP_TEST_COUNTRY_FANOUT_EXPLORE,
                compiledMetricQuery: POP_TEST_COUNTRY_FANOUT_METRIC_QUERY,
            }),
        ).toMatchSnapshot();
    });
});
