import {
    AnyType,
    BinType,
    CompiledMetricQuery,
    CustomDimensionType,
    DimensionType,
    Explore,
    FieldType,
    FilterOperator,
    ForbiddenError,
    JoinRelationship,
    MetricType,
    SortByDirection,
    SupportedDbtAdapter,
    TimeFrames,
    VizAggregationOptions,
    VizIndexType,
    type CompiledMetric,
} from '@lightdash/common';
import {
    BuildQueryProps,
    CompiledQuery,
    getIntervalSyntax,
    MetricQueryBuilder,
} from './MetricQueryBuilder';
import {
    bigqueryClientMock,
    EXPLORE,
    EXPLORE_NESTED_AGG_NAME_COLLISION,
    EXPLORE_WITH_AVERAGE_DISTINCT,
    EXPLORE_WITH_CROSS_MODEL_SUM_DISTINCT,
    EXPLORE_WITH_CROSS_TABLE_METRICS,
    EXPLORE_WITH_DATE_DIMENSION,
    EXPLORE_WITH_DATE_DIMENSION_ZOOMED,
    EXPLORE_WITH_FANOUT_AND_DD_REFERENCE,
    EXPLORE_WITH_NESTED_AGG,
    EXPLORE_WITH_SAME_MODEL_NUMBER_AND_SUM_DISTINCT,
    EXPLORE_WITH_SQL_FILTER,
    EXPLORE_WITH_SUM_DISTINCT,
    EXPLORE_WITHOUT_JOIN_RELATIONSHIPS,
    EXPLORE_WITHOUT_PRIMARY_KEYS,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    METRIC_QUERY_AVERAGE_DISTINCT_NO_DIMS,
    METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
    METRIC_QUERY_CROSS_MODEL_SUM_DISTINCT,
    METRIC_QUERY_CROSS_MODEL_SUM_DISTINCT_NO_DIMS,
    METRIC_QUERY_CROSS_TABLE,
    METRIC_QUERY_FANOUT_AND_DD_REFERENCE,
    METRIC_QUERY_NESTED_AGG_COMPLEX,
    METRIC_QUERY_NESTED_AGG_CONDITIONAL,
    METRIC_QUERY_NESTED_AGG_COUNT_DISTINCT,
    METRIC_QUERY_NESTED_AGG_MIXED,
    METRIC_QUERY_NESTED_AGG_MIXED_RAW,
    METRIC_QUERY_NESTED_AGG_MIXED_RAW_NO_DIMS,
    METRIC_QUERY_NESTED_AGG_MIXED_RAW_WITH_PURE,
    METRIC_QUERY_NESTED_AGG_NAME_COLLISION,
    METRIC_QUERY_NESTED_AGG_NO_DIMS,
    METRIC_QUERY_NESTED_AGG_PRODUCT,
    METRIC_QUERY_NESTED_AGG_RAW_COL,
    METRIC_QUERY_NESTED_AGG_TRANSITIVE,
    METRIC_QUERY_NESTED_AGG_TRANSITIVE_MIXED,
    METRIC_QUERY_NESTED_AGG_WINDOW_TABLE_REF,
    METRIC_QUERY_NESTED_AGG_WITH_DIMS,
    METRIC_QUERY_SAME_MODEL_NUMBER_WITH_SUM_DISTINCT,
    METRIC_QUERY_SUM_DISTINCT_NO_DIMS,
    METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
    METRIC_QUERY_TWO_TABLES,
    METRIC_QUERY_WITH_CUSTOM_DIMENSION,
    METRIC_QUERY_WITH_CUSTOM_USER_ATTRIBUTE_FILTER_VALUE,
    METRIC_QUERY_WITH_DATE_FILTER,
    METRIC_QUERY_WITH_METRIC_FILTER,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';

const replaceWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim();

// Wrapper around class to simplify test calls
const buildQuery = (
    args: Omit<BuildQueryProps, 'parameterDefinitions'>,
): CompiledQuery =>
    new MetricQueryBuilder({
        ...args,
        parameterDefinitions: {},
    }).compileQuery();

const POP_TEST_POP_METRIC_NAME = 'total_order_amount__pop__year_1__testpop';
const POP_TEST_POP_METRIC_ID = `orders_${POP_TEST_POP_METRIC_NAME}`;
const POP_TEST_FANOUT_POP_METRIC_NAME = 'metric_amount__pop__year_1__fanout';
const POP_TEST_FANOUT_POP_METRIC_ID = `table2_${POP_TEST_FANOUT_POP_METRIC_NAME}`;
const POP_TEST_COUNTRY_FANOUT_POP_METRIC_NAME =
    'total_order_amount__pop__year_1__country';
const POP_TEST_COUNTRY_FANOUT_POP_METRIC_ID = `country_orders_${POP_TEST_COUNTRY_FANOUT_POP_METRIC_NAME}`;
const EXPLORE_WITH_NESTED_AGG_AND_FANOUT: Explore = {
    ...EXPLORE_WITH_NESTED_AGG,
    joinedTables: [
        {
            table: 'fanout_users',
            sqlOn: '${my_table.id} = ${fanout_users.account_id}',
            compiledSqlOn: '("my_table".id) = ("fanout_users".account_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_MANY,
            tablesReferences: ['my_table', 'fanout_users'],
        },
    ],
    tables: {
        ...EXPLORE_WITH_NESTED_AGG.tables,
        my_table: {
            ...EXPLORE_WITH_NESTED_AGG.tables.my_table,
            metrics: {
                ...EXPLORE_WITH_NESTED_AGG.tables.my_table.metrics,
                cross_table_sum_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'cross_table_sum_of_max',
                    label: 'cross_table_sum_of_max',
                    sql: 'sum(${max_value}) / NULLIF(${fanout_users.count_users}, 0)',
                    compiledSql:
                        'SUM(MAX("my_table".value)) / NULLIF(COUNT("fanout_users".id), 0)',
                    tablesReferences: ['my_table', 'fanout_users'],
                    hidden: false,
                },
            },
        },
        fanout_users: {
            name: 'fanout_users',
            label: 'fanout_users',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."fanout_users"',
            primaryKey: ['id'],
            dimensions: {
                title: {
                    type: DimensionType.STRING,
                    name: 'title',
                    label: 'title',
                    table: 'fanout_users',
                    tableLabel: 'fanout_users',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.title',
                    compiledSql: '"fanout_users".title',
                    tablesReferences: ['fanout_users'],
                    hidden: false,
                },
            },
            metrics: {
                count_users: {
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'fanout_users',
                    tableLabel: 'fanout_users',
                    name: 'count_users',
                    label: 'count_users',
                    sql: '${TABLE}.id',
                    compiledSql: 'COUNT("fanout_users".id)',
                    tablesReferences: ['fanout_users'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

const METRIC_QUERY_NESTED_AGG_WITH_FANOUT: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['fanout_users_title'],
    metrics: ['my_table_sum_of_max', 'my_table_count_records'],
    filters: {},
    sorts: [{ fieldId: 'my_table_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

const METRIC_QUERY_NESTED_AGG_WITH_FANOUT_CROSS_TABLE: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['fanout_users_title'],
    metrics: ['my_table_cross_table_sum_of_max', 'my_table_count_records'],
    filters: {},
    sorts: [{ fieldId: 'my_table_cross_table_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

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

/**
 * country_orders → order_currencies fanout explore.
 * country_orders is the base table (one row per order per country).
 * order_currencies is joined one-to-many (multiple currencies per order).
 * PoP metric lives on order_currencies, triggering fanout-protected CTE path.
 */
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
describe('getIntervalSyntax', () => {
    test('Should use DATEADD for Redshift month granularity', () => {
        expect(
            getIntervalSyntax(
                SupportedDbtAdapter.REDSHIFT,
                '"orders".order_date',
                'pop.min_date',
                '>=',
                1,
                'month',
                false,
            ),
        ).toBe('"orders".order_date >= DATEADD(month, -1, pop.min_date)');
    });

    test('Should convert Redshift quarter granularity to months in DATEADD', () => {
        expect(
            getIntervalSyntax(
                SupportedDbtAdapter.REDSHIFT,
                '"orders".order_date',
                'pop.max_date',
                '<=',
                1,
                'quarter',
                false,
            ),
        ).toBe('"orders".order_date <= DATEADD(MONTH, -3, pop.max_date)');
    });
});

describe('Query builder', () => {
    test('Should reuse non-time filters for PoP metrics while shifting the comparison period', () => {
        const { query } = buildQuery({
            explore: POP_TEST_EXPLORE,
            compiledMetricQuery: POP_TEST_METRIC_QUERY,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(
            query.match(/\("orders"\.is_completed\) = true/g) ?? [],
        ).toHaveLength(2);
        expect(query.match(/\('2025-01-01'\)/g) ?? []).toHaveLength(1);
        expect(query).toMatch(
            /DATE_TRUNC\('YEAR', "orders"\.order_date\) >= pop_min_max_[a-z0-9_]+\.min_date - INTERVAL '1 YEAR'/,
        );
        expect(query).toMatch(
            /DATE_TRUNC\('YEAR', "orders"\.order_date\) <= pop_min_max_[a-z0-9_]+\.max_date - INTERVAL '1 YEAR'/,
        );
        // PoP CTE should always use LEFT JOIN to preserve base rows
        expect(query).toMatch(/LEFT JOIN pop_metrics_/);
    });

    test('Should not carry date filter into PoP CTE when only date filters exist', () => {
        const metricQueryWithOnlyDateFilter: CompiledMetricQuery = {
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
        };

        const { query } = buildQuery({
            explore: POP_TEST_EXPLORE,
            compiledMetricQuery: metricQueryWithOnlyDateFilter,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // The date filter should appear once in base_metrics but NOT in the PoP CTE
        expect(query.match(/\('2025-01-01'\)/g) ?? []).toHaveLength(1);
        // The PoP CTE should still have the shifted date range
        expect(query).toMatch(
            /DATE_TRUNC\('YEAR', "orders"\.order_date\) >= pop_min_max_[a-z0-9_]+\.min_date - INTERVAL '1 YEAR'/,
        );
        expect(query).toMatch(
            /DATE_TRUNC\('YEAR', "orders"\.order_date\) <= pop_min_max_[a-z0-9_]+\.max_date - INTERVAL '1 YEAR'/,
        );
    });

    test('Should use LEFT JOIN for PoP CTE so all base rows are returned when no filters are applied', () => {
        const metricQueryWithNoFilters: CompiledMetricQuery = {
            ...POP_TEST_METRIC_QUERY,
            filters: {},
        };

        const { query } = buildQuery({
            explore: POP_TEST_EXPLORE,
            compiledMetricQuery: metricQueryWithNoFilters,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should use LEFT JOIN, not INNER JOIN, so base rows aren't dropped
        expect(query).toMatch(/LEFT JOIN pop_metrics_/);
        expect(query).not.toMatch(/INNER JOIN pop_metrics_/);
    });

    test('Should wrap PoP queries in an outer metrics CTE so ORDER BY is not ambiguous', () => {
        const { query } = buildQuery({
            explore: POP_TEST_EXPLORE,
            compiledMetricQuery: POP_TEST_METRIC_QUERY,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(query).toMatch(/metrics AS \(\nSELECT\n {2}base_metrics\.\*/);
        expect(query).toMatch(
            /SELECT\s+\*\s+FROM metrics\s+ORDER BY "orders_order_date_year" DESC\s+LIMIT 500$/,
        );
    });

    test('Should reuse non-time filters for PoP metrics in fanout-protected CTEs while shifting the comparison period', () => {
        const { query } = buildQuery({
            explore: POP_TEST_FANOUT_EXPLORE,
            compiledMetricQuery: POP_TEST_FANOUT_METRIC_QUERY,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(query).toContain('cte_pop_keys_');
        expect(query).toContain('cte_pop_metrics_');
        expect(
            query.match(/\("table2"\.is_completed\) = true/g) ?? [],
        ).toHaveLength(3);
        expect(query.match(/\('2025-01-01'\)/g) ?? []).toHaveLength(2);
        expect(query).toMatch(
            /DATE_TRUNC\('YEAR', "table2"\.order_date\) >= cte_pop_min_max_[a-z0-9_]+__year_1__[a-z0-9_]+\.min_date - INTERVAL '1 YEAR'/,
        );
        expect(query).toMatch(
            /DATE_TRUNC\('YEAR', "table2"\.order_date\) <= cte_pop_min_max_[a-z0-9_]+__year_1__[a-z0-9_]+\.max_date - INTERVAL '1 YEAR'/,
        );
    });

    test('Should use LEFT JOIN for PoP CTE in fanout-protected path so all base rows are returned', () => {
        const metricQueryWithNoFilters: CompiledMetricQuery = {
            ...POP_TEST_FANOUT_METRIC_QUERY,
            filters: {},
        };

        const { query } = buildQuery({
            explore: POP_TEST_FANOUT_EXPLORE,
            compiledMetricQuery: metricQueryWithNoFilters,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Fanout-protected PoP CTE should use LEFT JOIN, not INNER JOIN
        expect(query).toContain('cte_pop_metrics_');
        expect(query).toMatch(/LEFT JOIN cte_pop_metrics_/);
        expect(query).not.toMatch(/INNER JOIN cte_pop_metrics_/);
    });

    test('Should use LEFT JOIN for PoP CTE in country_orders → order_currencies fanout so all base rows are returned', () => {
        const { query } = buildQuery({
            explore: POP_TEST_COUNTRY_FANOUT_EXPLORE,
            compiledMetricQuery: POP_TEST_COUNTRY_FANOUT_METRIC_QUERY,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should trigger fanout-protected CTE path since order_currencies is one-to-many
        expect(query).toContain('cte_pop_metrics_');
        // PoP CTE must use LEFT JOIN to preserve all base rows (e.g. countries
        // that exist in the current period but not the comparison period)
        expect(query).toMatch(/LEFT JOIN cte_pop_metrics_/);
        expect(query).not.toMatch(/INNER JOIN cte_pop_metrics_/);
    });

    test('Should throw error if user attributes are missing', () => {
        expect(
            () =>
                buildQuery({
                    explore: EXPLORE_WITH_SQL_FILTER,
                    compiledMetricQuery: METRIC_QUERY,
                    warehouseSqlBuilder: warehouseClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
        ).toThrow(ForbiddenError);
    });

    test('Should throw error if user attribute in filter value is missing', () => {
        expect(
            () =>
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery:
                        METRIC_QUERY_WITH_CUSTOM_USER_ATTRIBUTE_FILTER_VALUE,
                    warehouseSqlBuilder: warehouseClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
        ).toThrow(ForbiddenError);
    });

    it('buildQuery with row() table calculation should order by custom bin _order column', () => {
        const { query } = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                sorts: [{ fieldId: 'age_range', descending: false }],
                tableCalculations: [
                    {
                        name: 'row_num',
                        displayName: '',
                        sql: 'row()',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'row_num',
                        displayName: '',
                        sql: 'row()',
                        compiledSql: 'row()',
                        dependsOn: [],
                    },
                ],
            },
            warehouseSqlBuilder: bigqueryClientMock,
            userAttributes: {},
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(query).toContain(
            'ROW_NUMBER() OVER (ORDER BY `age_range_order`) AS `row_num`',
        );
    });

    it('buildQuery with custom dimension not selected', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    dimensions: ['table1_dim1'], // without age_range
                },
                warehouseSqlBuilder: bigqueryClientMock,
                userAttributes: {},
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).not.toContain('age_range');
    });
    it('Should not let string-derived time filters satisfy required date filters', () => {
        const exploreWithStringDerivedTimeDimension: Explore = {
            ...EXPLORE_WITH_DATE_DIMENSION,
            tables: {
                ...EXPLORE_WITH_DATE_DIMENSION.tables,
                orders: {
                    ...EXPLORE_WITH_DATE_DIMENSION.tables.orders,
                    requiredFilters: [
                        {
                            id: 'required-created-at',
                            target: {
                                fieldRef: 'created_at',
                            },
                            operator: FilterOperator.IN_BETWEEN,
                            values: ['2024-09-01', '2024-09-04'],
                            required: true,
                        },
                    ],
                    dimensions: {
                        ...EXPLORE_WITH_DATE_DIMENSION.tables.orders.dimensions,
                        created_at: {
                            ...EXPLORE_WITH_DATE_DIMENSION.tables.orders
                                .dimensions.created_at,
                            isIntervalBase: true,
                        },
                        created_at_fiscal_quarter: {
                            type: DimensionType.STRING,
                            name: 'created_at_fiscal_quarter',
                            label: 'created_at_fiscal_quarter',
                            table: 'orders',
                            tableLabel: 'orders',
                            fieldType: FieldType.DIMENSION,
                            sql: '${TABLE}.created_at_fiscal_quarter',
                            compiledSql: '"orders".created_at_fiscal_quarter',
                            tablesReferences: ['orders'],
                            hidden: false,
                            timeIntervalBaseDimensionName: 'created_at',
                            customTimeInterval: 'fiscal_quarter',
                        },
                    },
                },
            },
        };

        const queryWithOnlyStringDerivedTimeFilter: CompiledMetricQuery = {
            ...METRIC_QUERY_WITH_DATE_FILTER,
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'string-derived-filter',
                            target: {
                                fieldId: 'orders_created_at_fiscal_quarter',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['FY2024-Q1'],
                        },
                    ],
                },
            },
        };

        const query = replaceWhitespace(
            buildQuery({
                explore: exploreWithStringDerivedTimeDimension,
                compiledMetricQuery: queryWithOnlyStringDerivedTimeFilter,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        );

        expect(query).toContain(
            replaceWhitespace(
                '(("orders".created_at) >= (\'2024-09-01\') AND ("orders".created_at) <= (\'2024-09-04\'))',
            ),
        );
    });

    describe('getNullsFirstLast static method', () => {
        test('Should return empty string when nullsFirst is null', () => {
            const sort = {
                fieldId: 'test',
                descending: false,
                nullsFirst: undefined,
            };
            expect(MetricQueryBuilder.getNullsFirstLast(sort)).toBe('');
        });

        test('Should return " NULLS FIRST" when nullsFirst is true', () => {
            const sort = {
                fieldId: 'test',
                descending: false,
                nullsFirst: true,
            };
            expect(MetricQueryBuilder.getNullsFirstLast(sort)).toBe(
                ' NULLS FIRST',
            );
        });

        test('Should return " NULLS LAST" when nullsFirst is false', () => {
            const sort = {
                fieldId: 'test',
                descending: false,
                nullsFirst: false,
            };
            expect(MetricQueryBuilder.getNullsFirstLast(sort)).toBe(
                ' NULLS LAST',
            );
        });

        test('Should work correctly with descending sort', () => {
            const sortFirst = {
                fieldId: 'test',
                descending: true,
                nullsFirst: true,
            };
            const sortLast = {
                fieldId: 'test',
                descending: true,
                nullsFirst: false,
            };

            expect(MetricQueryBuilder.getNullsFirstLast(sortFirst)).toBe(
                ' NULLS FIRST',
            );
            expect(MetricQueryBuilder.getNullsFirstLast(sortLast)).toBe(
                ' NULLS LAST',
            );
        });
    });

    describe('nullsFirst in sort queries', () => {
        test('Should build query with NULLS FIRST on dimension', () => {
            const queryWithNullsFirst = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsFirst.query).toContain(
                'ORDER BY "table1_dim1" NULLS FIRST',
            );
        });

        test('Should build query with NULLS LAST on dimension', () => {
            const queryWithNullsLast = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: false,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsLast.query).toContain(
                'ORDER BY "table1_dim1" NULLS LAST',
            );
        });

        test('Should build query with NULLS FIRST on metric descending', () => {
            const queryWithNullsFirst = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsFirst.query).toContain(
                'ORDER BY "table1_metric1" DESC NULLS FIRST',
            );
        });

        test('Should build query with NULLS LAST on metric descending', () => {
            const queryWithNullsLast = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: false,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsLast.query).toContain(
                'ORDER BY "table1_metric1" DESC NULLS LAST',
            );
        });

        test('Should build query with multiple sorts using nullsFirst', () => {
            const queryWithMultipleSorts = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: true,
                        },
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: false,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithMultipleSorts.query).toContain(
                'ORDER BY "table1_dim1" NULLS FIRST, "table1_metric1" DESC NULLS LAST',
            );
        });

        test('Should build query with mixed nullsFirst values', () => {
            const queryWithMixedNulls = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: undefined, // Should omit NULLS clause
                        },
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            const orderByClause =
                queryWithMixedNulls.query.match(/ORDER BY[^;]+/)?.[0];
            expect(orderByClause).toContain('"table1_dim1"');
            expect(orderByClause).not.toContain('"table1_dim1" NULLS');
            expect(orderByClause).toContain(
                '"table1_metric1" DESC NULLS FIRST',
            );
        });

        test('Should work with custom bin dimensions and nullsFirst', () => {
            const queryWithCustomDimAndNullsFirst = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    sorts: [
                        {
                            fieldId: 'age_range',
                            descending: false,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithCustomDimAndNullsFirst.query).toContain(
                '"age_range_order" NULLS FIRST',
            );
        });
    });

    describe('PostCalculation Metrics', () => {
        test('Should build query with percent_of_total postcalculation metric', () => {
            // Create an explore with a postcalculation metric
            const exploreWithPostCalcMetric = {
                ...EXPLORE,
                tables: {
                    ...EXPLORE.tables,
                    table1: {
                        ...EXPLORE.tables.table1,
                        metrics: {
                            ...EXPLORE.tables.table1.metrics,
                            percent_of_total_metric: {
                                type: MetricType.PERCENT_OF_TOTAL,
                                fieldType: FieldType.METRIC as const,
                                table: 'table1',
                                tableLabel: 'table1',
                                name: 'percent_of_total_metric',
                                label: 'Percent of Total',
                                sql: '${table1.metric1}',
                                compiledSql: '...',
                                tablesReferences: ['table1'],
                                hidden: false,
                            },
                        },
                    },
                },
            };

            const metricQueryWithPostCalc = {
                ...METRIC_QUERY,
                metrics: ['table1_metric1', 'table1_percent_of_total_metric'],
                tableCalculations: [],
                compiledTableCalculations: [],
            };

            const result = buildQuery({
                explore: exploreWithPostCalcMetric,
                compiledMetricQuery: metricQueryWithPostCalc,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            const expectedSQL = `WITH metrics AS (
SELECT
  "table1".dim1 AS "table1_dim1",
  MAX("table1".number_column) AS "table1_metric1"
FROM "db"."schema"."table1" AS "table1"

GROUP BY 1
),
postcalculation_metrics AS (
SELECT
  *,
  (CAST(metrics."table1_metric1" AS FLOAT) / CAST(NULLIF(SUM(metrics."table1_metric1") OVER(), 0) AS FLOAT)) AS "table1_percent_of_total_metric"
FROM metrics
)
SELECT
  *
FROM postcalculation_metrics
ORDER BY "table1_metric1" DESC
LIMIT 10`;
        });

        test('Should build query with running_total postcalculation metric and pivot configuration', () => {
            // Create an explore with a running_total metric and two dimensions
            const exploreWithRunningTotalAndDimensions: Explore = {
                ...EXPLORE,
                tables: {
                    ...EXPLORE.tables,
                    table1: {
                        ...EXPLORE.tables.table1,
                        dimensions: {
                            ...EXPLORE.tables.table1.dimensions,
                            category: {
                                type: DimensionType.STRING,
                                name: 'category',
                                label: 'Category',
                                table: 'table1',
                                tableLabel: 'table1',
                                fieldType: FieldType.DIMENSION,
                                sql: '${TABLE}.category',
                                compiledSql: '"table1".category',
                                tablesReferences: ['table1'],
                                hidden: false,
                            },
                        },
                        metrics: {
                            ...EXPLORE.tables.table1.metrics,
                            running_total_metric: {
                                type: MetricType.RUNNING_TOTAL,
                                fieldType: FieldType.METRIC,
                                table: 'table1',
                                tableLabel: 'table1',
                                name: 'running_total_metric',
                                label: 'Running Total',
                                sql: '${table1.metric1}',
                                compiledSql: '...',
                                tablesReferences: ['table1'],
                                hidden: false,
                            },
                        },
                    },
                },
            };

            const metricQueryWithPivot = {
                ...METRIC_QUERY,
                dimensions: ['table1_dim1', 'table1_category'],
                metrics: ['table1_running_total_metric'],
                tableCalculations: [],
                compiledTableCalculations: [],
            };

            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'table1_dim1', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'table1_running_total_metric',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'table1_category' }],
                sortBy: [
                    {
                        reference: 'table1_dim1',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const result = buildQuery({
                explore: exploreWithRunningTotalAndDimensions,
                compiledMetricQuery: metricQueryWithPivot,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                pivotConfiguration,
            });

            const expectedSQL = `WITH metrics AS (
SELECT
  "table1".dim1 AS "table1_dim1",
  "table1".category AS "table1_category",
  MAX("table1".number_column) AS "table1_metric1"
FROM "db"."schema"."table1" AS "table1"

GROUP BY 1,2
),
postcalculation_metrics AS (
SELECT
  *,
  SUM(metrics."table1_metric1") OVER (PARTITION BY "table1_category"ORDER BY "table1_metric1" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "table1_running_total_metric"
FROM metrics
)
SELECT
  *
FROM postcalculation_metrics
ORDER BY "table1_metric1" DESC
LIMIT 10`;

            // Should create a postcalculation metrics CTE and include pivot configuration handling
            expect(result.query).toContain('postcalculation_metrics AS');
            expect(result.query).toContain('"table1_running_total_metric"');
            expect(result.query).toContain('"table1_dim1"');
            expect(result.query).toContain('"table1_category"');
        });
    });

    describe('Parameters', () => {
        test('Should build query with parameters in dimensions', () => {
            const exploreWithParameterDimension = {
                ...EXPLORE,
                tables: {
                    ...EXPLORE.tables,
                    table1: {
                        ...EXPLORE.tables.table1,
                        dimensions: {
                            ...EXPLORE.tables.table1.dimensions,
                            dim1: {
                                ...EXPLORE.tables.table1.dimensions.dim1,
                                compiledSql:
                                    'CASE WHEN ${lightdash.parameters.status} = \'active\' THEN "table1".dim1 ELSE NULL END',
                            },
                        },
                    },
                },
            };

            const result = buildQuery({
                explore: exploreWithParameterDimension,
                compiledMetricQuery: METRIC_QUERY,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                parameters: { status: 'active' },
            });

            expect(result.query).toContain(
                "CASE WHEN 'active' = 'active' THEN \"table1\".dim1 ELSE NULL END",
            );
        });

        test('Should build query with parameters in sql_on statements', () => {
            const exploreWithParameterJoin = {
                ...EXPLORE,
                joinedTables: [
                    {
                        table: 'table2',
                        sqlOn: "${table1.shared} = ${table2.shared} AND ${lightdash.parameters.status} = 'active'",
                        compiledSqlOn:
                            '("table1".shared) = ("table2".shared) AND ${lightdash.parameters.status} = \'active\'',
                        type: undefined,
                        tablesReferences: ['table1', 'table2'],
                        relationship: JoinRelationship.MANY_TO_ONE,
                    },
                ],
            };

            const result = buildQuery({
                explore: exploreWithParameterJoin,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                parameters: { status: 'active' },
            });

            expect(result.query).toContain(
                '("table1".shared) = ("table2".shared) AND \'active\' = \'active\'',
            );
        });

        test('Should correctly identify usedParameters in query', () => {
            // Create a QueryBuilder instance directly to test getSqlAndReferences
            const queryBuilder = new MetricQueryBuilder({
                explore: {
                    ...EXPLORE,
                    tables: {
                        ...EXPLORE.tables,
                        table1: {
                            ...EXPLORE.tables.table1,
                            dimensions: {
                                ...EXPLORE.tables.table1.dimensions,
                                dim1: {
                                    ...EXPLORE.tables.table1.dimensions.dim1,
                                    compiledSql:
                                        'CASE WHEN ${lightdash.parameters.status} = \'active\' THEN "table1".dim1 WHEN ${lightdash.parameters.region} = \'EU\' THEN "table1".dim2 ELSE NULL END',
                                },
                            },
                        },
                    },
                },
                compiledMetricQuery: METRIC_QUERY,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                parameters: {
                    status: 'active',
                    region: 'EU',
                    unused: 'parameter',
                },
                parameterDefinitions: {
                    status: { label: 'Status', type: 'string' },
                    region: { label: 'Region', type: 'string' },
                    unused: { label: 'Unused', type: 'string' },
                },
            });

            const compiledQuery = queryBuilder.compileQuery();

            // Check that usedParameters only includes parameters that are actually used in the query
            expect(compiledQuery.usedParameters).toEqual({
                status: 'active',
                region: 'EU',
            });

            // Verify that unused parameter is not included
            expect(compiledQuery.usedParameters).not.toHaveProperty('unused');
        });
    });

    describe('Query builder with deduplication', () => {
        test('Should build query with CTEs for metrics to prevent inflation', () => {
            // Use the imported explore mock with MANY_TO_ONE relationship to trigger metric inflation
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    metrics: ['table1_metric1', 'table2_metric3'],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.warnings).toHaveLength(0);
        });

        test('Should build query with CTEs for metrics and CROSS join', () => {
            // Use the imported explore mock with MANY_TO_ONE relationship to trigger metric inflation
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: [], // no dimensions in the query causes a CROSS join
                    metrics: ['table1_metric1', 'table2_metric3'],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.warnings).toHaveLength(0);
        });

        test('Should handle inflation-proof metrics correctly', () => {
            // Create a metric query that includes both the count distinct metric and the sum metric
            const metricQueryWithMixedMetrics = {
                ...METRIC_QUERY_TWO_TABLES,
                metrics: [
                    'table2_metric2',
                    'table1_metric1',
                    'table1_metric_that_references_dim_from_table2',
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithMixedMetrics,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.warnings).toHaveLength(0);
            expect(result.query).not.toContain('cte_keys_');
            expect(result.query).not.toContain('cte_metrics_');
            expect(result.query).not.toContain('cte_unaffected');
        });

        test('Should generate warnings for tables without primary keys', () => {
            const result = buildQuery({
                explore: EXPLORE_WITHOUT_PRIMARY_KEYS,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have warnings about missing primary keys
            expect(
                result.warnings.some((w) =>
                    w.message.includes('missing a primary key definition'),
                ),
            ).toBe(true);

            // Should have warnings about metrics that could be inflated
            expect(
                result.warnings.some((w) =>
                    w.message.includes(
                        'could be inflated due to table missing primary key definition',
                    ),
                ),
            ).toBe(true);
        });

        test('Should generate warnings for joins without relationship type', () => {
            const result = buildQuery({
                explore: EXPLORE_WITHOUT_JOIN_RELATIONSHIPS,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have warnings about missing relationship type
            expect(
                result.warnings.some((w) =>
                    w.message.includes('missing a join relationship type'),
                ),
            ).toBe(true);

            // Should have warnings about metrics that could be inflated
            expect(
                result.warnings.some((w) =>
                    w.message.includes(
                        'could be inflated due to missing join relationship type',
                    ),
                ),
            ).toBe(true);
        });

        test('Should handle metrics referencing other metrics when base metrics are also selected', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_CROSS_TABLE_METRICS,
                compiledMetricQuery: {
                    ...METRIC_QUERY_CROSS_TABLE,
                    metrics: [
                        'orders_revenue_per_customer',
                        'orders_total_order_amount',
                        'customers_total_customers',
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            const sql = result.query;

            const countOccurrences = (search: string) => {
                // escape all special characters
                const escapedSearch = search.replace(
                    /[-[\]{}()*+?.,\\^$|#\s]/g,
                    '\\$&',
                );
                const matches = sql.match(new RegExp(escapedSearch, 'g')) || [];
                return matches.length;
            };

            expect(
                countOccurrences(
                    'SUM("orders".amount) AS "orders_total_order_amount"',
                ),
            ).toBe(1);
            expect(
                countOccurrences(
                    'COUNT("customers".customer_id) AS "customers_total_customers"',
                ),
            ).toBe(1);
            expect(
                countOccurrences(
                    'cte_unaffected."orders_total_order_amount" / cte_metrics_customers."customers_total_customers" AS "orders_revenue_per_customer"',
                ),
            ).toBe(1);
        });

        test('Should include filter-only metric in fanout CTE but exclude from final SELECT', () => {
            // Query with dimension + metric1 selected, but filter on metric3 (from joined table with fanout)
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select table1_metric1
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on table2_metric3 but don't select it
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [100],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate table2_metric3 in the CTE
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have metric filter applied
            expect(result.query).toContain('("table2_metric3") > (100)');

            // Should NOT include table2_metric3 in the final column list
            // The final SELECT should explicitly list columns, not use *
            expect(result.query).toContain('"table1_dim1"');
            expect(result.query).toContain('"table1_metric1"');

            // Verify the final SELECT doesn't use SELECT * when filter-only metrics exist
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+(?:WHERE|ORDER|LIMIT)/s,
            );
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                // Should not be just "*"
                expect(selectClause).not.toBe('*');
            }
        });

        test('Should handle filter-only metric from same table (no fanout needed)', () => {
            // Query with filter on a metric from the same table as the selected metric
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Selected metric
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table1_metric1', // Filter on same metric (not filter-only)
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [50],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should NOT create fanout CTEs (same table, no fanout risk)
            expect(result.query).not.toContain('cte_keys_');
            expect(result.query).not.toContain('cte_metrics_');

            // Should have metric filter applied
            expect(result.query).toContain('("table1_metric1") > (50)');
        });

        test('Should handle multiple filter-only metrics with fanout protection', () => {
            // Query filtering on both table2_metric2 and table2_metric3 but only selecting table1_metric1
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select from table1
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric2', // Filter on metric2
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [50],
                                },
                                {
                                    id: '2',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on metric3
                                    },
                                    operator: FilterOperator.LESS_THAN,
                                    values: [200],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate both filter-only metrics in the CTE
            expect(result.query).toContain(
                'MAX("table2".number_column) AS "table2_metric2"',
            );
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have both metric filters applied
            expect(result.query).toContain('("table2_metric2") > (50)');
            expect(result.query).toContain('("table2_metric3") < (200)');

            // Final SELECT should only include table1 fields
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+(?:WHERE|ORDER|LIMIT)/s,
            );
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                expect(selectClause).toContain('"table1_dim1"');
                expect(selectClause).toContain('"table1_metric1"');
            }
        });

        test('Should handle mix of selected and filter-only metrics from joined table', () => {
            // Query selecting table2_metric2 and filtering on table2_metric3
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1', 'table2_metric2'], // Select metric2
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on metric3 (filter-only)
                                    },
                                    operator: FilterOperator.NOT_NULL,
                                    values: [],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table2_metric2', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate both metric2 (selected) and metric3 (filter-only) in the CTE
            expect(result.query).toContain(
                'MAX("table2".number_column) AS "table2_metric2"',
            );
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have metric filter applied
            expect(result.query).toContain('("table2_metric3") IS NOT NULL');

            // Final SELECT should include table1_dim1, table1_metric1, and table2_metric2 but NOT table2_metric3
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+(?:WHERE|ORDER|LIMIT)/s,
            );
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                expect(selectClause).toContain('"table1_dim1"');
                expect(selectClause).toContain('"table1_metric1"');
                expect(selectClause).toContain('"table2_metric2"');
                // Should not select table2_metric3 even though it's calculated in the CTE
            }
        });

        test('Should handle filter-only metric with table calculations', () => {
            // Query with filter-only metric and table calculations
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select table1_metric1
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on table2_metric3
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: [100],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                        },
                    ],
                    compiledTableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                            compiledSql: '"table1_metric1" * 2',
                            dependsOn: [],
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate filter-only metric in the CTE
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have metric filter applied in WHERE clause
            expect(result.query).toContain('("table2_metric3") IN (100)');

            // Final SELECT should explicitly list only the selected columns (not SELECT *)
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+WHERE/s,
            );
            expect(finalSelectMatch).toBeTruthy();
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                // Should include the selected dimension and metric
                expect(selectClause).toContain('"table1_dim1"');
                expect(selectClause).toContain('"table1_metric1"');
                // Should include the table calculation
                expect(selectClause).toContain('"calc1"');
                // Should NOT be SELECT * (since we have filter-only metrics)
                expect(selectClause).not.toBe('*');
            }
        });

        test('Should include table calculation in SELECT when table calc has filter AND filter-only metric exists', () => {
            // Reproduces bug: table calc displays as "-" when:
            // 1. Table calculation is in results
            // 2. Table calculation has a filter
            // 3. A metric NOT in results IS in filter
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select table1_metric1
                    filters: {
                        metrics: {
                            id: 'metric-filter-root',
                            and: [
                                {
                                    id: 'metric-filter-1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on table2_metric3 (not in SELECT)
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: [100],
                                },
                            ],
                        },
                        tableCalculations: {
                            id: 'tc-filter-root',
                            and: [
                                {
                                    id: 'tc-filter-1',
                                    target: {
                                        fieldId: 'calc1',
                                    },
                                    operator: FilterOperator.NOT_NULL,
                                    values: [],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                        },
                    ],
                    compiledTableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                            compiledSql: '"table1_metric1" * 2',
                            dependsOn: [],
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have table_calculations CTE (because table calc has filter)
            expect(result.query).toContain('table_calculations AS (');

            // Should calculate filter-only metric in the CTE
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Final SELECT should explicitly include the table calculation
            // Match the SELECT after the CTE closing paren (not the SELECT inside the CTE)
            const finalSelectMatch = result.query.match(
                /\)\s*SELECT\s+(.*?)\s+FROM\s+table_calculations\s+WHERE/s,
            );
            expect(finalSelectMatch).toBeTruthy();
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                // Should include the selected dimension
                expect(selectClause).toContain('"table1_dim1"');
                // Should include the selected metric
                expect(selectClause).toContain('"table1_metric1"');
                // Should include the table calculation (this was the bug - it was missing)
                expect(selectClause).toContain('"calc1"');
                // Should NOT include the filter-only metric
                expect(selectClause).not.toContain('"table2_metric3"');
                // Should NOT be SELECT * (since we have filter-only metrics)
                expect(selectClause).not.toBe('*');
            }

            // Should have both metric and table calc filters in WHERE clause
            expect(result.query).toContain('("table2_metric3") IN (100)');
            expect(result.query).toContain('("calc1") IS NOT NULL');
        });

        test('Should not create cte_unaffected with empty SELECT when only dimension filters exist', () => {
            const noDimensionsSelected: string[] = [];
            const onlyMetricFromJoinedTable = ['table2_metric3'];
            const dimensionFilterWithoutDimensionInSelect = {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: '1',
                            target: {
                                fieldId: 'table1_dim1',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [2025],
                        },
                    ],
                },
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: noDimensionsSelected,
                    metrics: onlyMetricFromJoinedTable,
                    filters: dimensionFilterWithoutDimensionInSelect,
                    sorts: [{ fieldId: 'table2_metric3', descending: true }],
                    limit: 500,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.query).not.toContain(
                'cte_unaffected AS (\nSELECT\nFROM',
            );
        });

        test('sum_distinct should include selected dimensions in PARTITION BY', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // The PARTITION BY should include both the distinct key and the selected dimensions
            expect(result.query).toContain(
                'PARTITION BY "orders".line_item_id, "orders".payment_method, "orders".status',
            );
            // Should still have the ROW_NUMBER window function
            expect(result.query).toContain('ROW_NUMBER() OVER');
            // Should have the dd CTE
            expect(result.query).toContain('dd_orders_total_revenue');
        });

        test('sum_distinct should work with no dimensions selected', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_SUM_DISTINCT_NO_DIMS,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // PARTITION BY should contain only the distinct key (no dimensions)
            expect(result.query).toContain(
                'PARTITION BY "orders".line_item_id ORDER BY',
            );
            // Should use CROSS JOIN (no dimensions to join on)
            expect(result.query).not.toContain('INNER JOIN dd_');
        });

        test('average_distinct should generate CTE with FLOAT division', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_AVERAGE_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_AVERAGE_DISTINCT_NO_DIMS,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.query).toContain('ROW_NUMBER() OVER');
            expect(result.query).toContain('dd_orders_avg_shipping_cost');
            expect(result.query).toContain(
                'PARTITION BY "orders".line_item_id ORDER BY',
            );
            // Should use FLOAT division, not integer division
            expect(result.query).toContain(
                'CAST(SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END) AS FLOAT)',
            );
            expect(result.query).toContain(
                'CAST(NULLIF(COUNT(CASE WHEN __dd_rn = 1 THEN __dd_val END), 0) AS FLOAT)',
            );
            // Neither distinct metric type should use COALESCE
            expect(result.query).not.toContain('COALESCE');
        });

        test('average_distinct should include selected dimensions in PARTITION BY', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_AVERAGE_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.query).toContain(
                'PARTITION BY "orders".line_item_id, "orders".payment_method',
            );
            expect(result.query).toContain('GROUP BY');
            expect(result.query).toContain('dd_orders_avg_shipping_cost');
        });

        test('type:number metric referencing cross-model sum_distinct should use CTE', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_CROSS_MODEL_SUM_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_CROSS_MODEL_SUM_DISTINCT,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // The sum_distinct metric should get a deduplication CTE
            expect(result.query).toContain('dd_orders_total_revenue');
            // The CTE should use ROW_NUMBER for deduplication
            expect(result.query).toContain('ROW_NUMBER() OVER');
            // The type:number metric should reference the CTE alias,
            // NOT inline the raw SUM("orders".amount)
            expect(result.query).toContain(
                'dd_orders_total_revenue."orders_total_revenue"',
            );
            // The inlined fallback SUM should NOT appear in the final SELECT
            // (it's OK inside the CTE, but not in the outer query)
            const outerSelect =
                result.query.split('FROM')[
                    result.query.split('FROM').length - 1
                ];
            // Check the final SELECT doesn't use the raw inlined SQL
            expect(result.query).not.toMatch(
                /SELECT[\s\S]*\(SUM\("orders"\.amount\)\) \* 1\.1[\s\S]*FROM(?![\s\S]*AS \()/,
            );
        });

        test('same-model type:number referencing sum_distinct + regular aggregate should not break', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_SAME_MODEL_NUMBER_AND_SUM_DISTINCT,
                compiledMetricQuery:
                    METRIC_QUERY_SAME_MODEL_NUMBER_WITH_SUM_DISTINCT,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // The dd CTE should exist for the sum_distinct metric
            expect(result.query).toContain('dd_orders_total_revenue');
            // The type:number metric should reference the dd CTE for sum_distinct
            expect(result.query).toContain(
                'dd_orders_total_revenue."orders_total_revenue"',
            );
            // The non-dd metric (order_count) should reference dd_base, not raw SQL
            expect(result.query).toContain('dd_base."orders_order_count"');
            // The outer SELECT after dd_base should use the CTE alias, not
            // recompile to raw COUNT("orders".order_id)
            const outerSelect = result.query
                .split('FROM dd_base')[0]
                .split('SELECT')
                .pop();
            expect(outerSelect).not.toContain('COUNT("orders".order_id)');
        });

        test('type:number referencing cross-model sum_distinct works without dimensions', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_CROSS_MODEL_SUM_DISTINCT,
                compiledMetricQuery:
                    METRIC_QUERY_CROSS_MODEL_SUM_DISTINCT_NO_DIMS,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should still have CTE-based deduplication
            expect(result.query).toContain('dd_orders_total_revenue');
            expect(result.query).toContain('ROW_NUMBER() OVER');
            // Should reference CTE, not inlined SQL
            expect(result.query).toContain(
                'dd_orders_total_revenue."orders_total_revenue"',
            );
        });

        // SPK-333: when a non-aggregate metric references a sum_distinct metric
        // AND another metric on the query forces fanout protection (cte_keys_/
        // cte_metrics_/cte_unaffected), the non-aggregate metric must still
        // route the sum_distinct reference through the dd CTE. Previously the
        // fanout flow inlined the fallback SUM() into dd_base, referencing a
        // table not in scope and producing invalid SQL.
        test('non-aggregate referencing sum_distinct should route through dd CTE even with fanout protection', () => {
            const result = buildQuery({
                explore: EXPLORE_WITH_FANOUT_AND_DD_REFERENCE,
                compiledMetricQuery: METRIC_QUERY_FANOUT_AND_DD_REFERENCE,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Fanout protection is active.
            expect(result.query).toContain('cte_unaffected');
            expect(result.query).toContain('cte_metrics_orders');
            // Sum_distinct has its own dd CTE.
            expect(result.query).toContain(
                'dd_customers_total_order_amount_deduped',
            );
            // dd_base wraps the fanout result.
            expect(result.query).toContain('dd_base');

            // The inlined fallback SUM referencing "orders" outside its CTE
            // scope must NOT appear anywhere (it would be invalid SQL inside
            // dd_base, which projects FROM cte_unaffected CROSS JOIN ...).
            expect(result.query).not.toContain(
                'SUM(("orders".amount))) / NULLIF',
            );

            // The non-aggregate metric must reference the dd CTE alias for
            // its sum_distinct dependency, not raw SQL.
            expect(result.query).toContain(
                'dd_customers_total_order_amount_deduped."customers_total_order_amount_deduped" / NULLIF',
            );

            // customers_average_customer_lifetime_value must be projected
            // exactly once in the final SELECT — emitting it both via
            // dd_base.* and explicitly in the outer SELECT produces
            // "column specified more than once" errors on most warehouses.
            const occurrences = (
                result.query.match(
                    /AS "customers_average_customer_lifetime_value"/g,
                ) ?? []
            ).length;
            expect(occurrences).toBe(1);
        });
    });

    describe('Table Calculations', () => {
        test('Should build query with simple table calculations (no CTEs)', () => {
            const metricQueryWithSimpleTableCalcs = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} + 100',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} + 100',
                        compiledSql: '"table1_metric1" + 100',
                        dependsOn: [],
                        // No CTE since it doesn't reference other table calculations
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithSimpleTableCalcs,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have the simple table calculation inline in the final SELECT
            expect(result.query).toContain(
                '"table1_metric1" + 100 AS "simple_calc"',
            );

            // Should have basic metrics CTE but no table calculation CTEs
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).not.toContain('tc_simple_calc AS (');

            // Should select from metrics CTE with inline table calculation
            expect(result.query).toContain('FROM metrics');
        });

        test('Should build query with table calculation CTEs for dependent calculations', () => {
            const metricQueryWithDependentTableCalcs = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 50',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 2',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 50',
                        compiledSql: '"table1_metric1" + 50',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 2',
                        compiledSql: '"base_calc" * 2',
                        dependsOn: ['base_calc'],
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithDependentTableCalcs,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have CTEs for dependent table calculations
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_base_calc AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should select from the final CTE
            expect(result.query).toContain('FROM tc_dependent_calc');

            // Should reference the base_calc
            expect(result.query).toContain('"base_calc" * 2');
        });

        test('Should build query with mixed table calculations (some with CTEs, some inline)', () => {
            const metricQueryWithMixedTableCalcs = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} / 10',
                    },
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 25',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 3',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} / 10',
                        compiledSql: '"table1_metric1" / 10',
                        dependsOn: [],
                        // No CTE - not referenced by others
                    },
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 25',
                        compiledSql: '"table1_metric1" + 25',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 3',
                        compiledSql: '"base_calc" * 3',
                        dependsOn: ['base_calc'],
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithMixedTableCalcs,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have CTEs for dependent calculations but include simple calc in table_calculations CTE
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('table_calculations AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should include simple calculation in the table_calculations CTE
            expect(result.query).toContain(
                '"table1_metric1" / 10 AS "simple_calc"',
            );

            // Should select from the final dependent CTE
            expect(result.query).toContain('FROM tc_dependent_calc');
        });

        test('Should build query with complex table calculation dependencies (referencing multiple calcs)', () => {
            const metricQueryWithComplexDeps = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'calc_a',
                        displayName: 'Calc A',
                        sql: '${table1.metric1} + 10',
                    },
                    {
                        name: 'calc_b',
                        displayName: 'Calc B',
                        sql: '${table1.metric1} * 2',
                    },
                    {
                        name: 'calc_c',
                        displayName: 'Calc C',
                        sql: '${calc_a} + ${calc_b}',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'calc_a',
                        displayName: 'Calc A',
                        sql: '${table1.metric1} + 10',
                        compiledSql: '"table1_metric1" + 10',
                        dependsOn: [],
                    },
                    {
                        name: 'calc_b',
                        displayName: 'Calc B',
                        sql: '${table1.metric1} * 2',
                        compiledSql: '"table1_metric1" * 2',
                        dependsOn: [],
                    },
                    {
                        name: 'calc_c',
                        displayName: 'Calc C',
                        sql: '${calc_a} + ${calc_b}',
                        compiledSql: '"calc_a" + "calc_b"',
                        dependsOn: ['calc_a', 'calc_b'],
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithComplexDeps,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have all CTEs in correct order (no table_calculations CTE for this case)
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_calc_a AS (');
            expect(result.query).toContain('tc_calc_b AS (');
            expect(result.query).toContain('tc_calc_c AS (');

            // Should select from the final CTE
            expect(result.query).toContain('FROM tc_calc_c');

            // Should show the CTE reference resolution working correctly
            expect(result.query).toContain('"calc_a" + "calc_b"');
        });

        test('Should build query with table calculation filters using CTEs', () => {
            const metricQueryWithTableCalcFilter = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'filtered_calc',
                        displayName: 'Filtered Calc',
                        sql: '${table1.metric1} * 1.5',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${filtered_calc} + 100',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'filtered_calc',
                        displayName: 'Filtered Calc',
                        sql: '${table1.metric1} * 1.5',
                        compiledSql: '"table1_metric1" * 1.5',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${filtered_calc} + 100',
                        compiledSql: '"filtered_calc" + 100',
                        dependsOn: ['filtered_calc'],
                    },
                ],
                filters: {
                    tableCalculations: {
                        id: 'table-calc-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'filtered_calc' },
                                operator: FilterOperator.EQUALS,
                                values: ['100'],
                            },
                        ],
                    },
                },
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithTableCalcFilter,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have CTEs for the dependent table calculations
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_filtered_calc AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should select from final CTE with table calculation filter applied
            expect(result.query).toContain('FROM tc_dependent_calc');

            // Should have the table calculation filter in the WHERE clause
            expect(result.query).toContain('WHERE');
            expect(result.query).toContain('"filtered_calc") IN (\'100\')');
        });
    });
});

describe('Escaping filters', () => {
    test('Should return valid SQL filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY,
                        filters: {
                            dimensions: {
                                id: '7e750e7c-8098-4a90-b364-4e935ad7a7e9',
                                and: [
                                    {
                                        id: 'd69d3ba0-6ff5-4437-9ef3-4ed69006ea2e',
                                        target: { fieldId: 'table1_dim1' },
                                        operator: FilterOperator.EQUALS,
                                        values: ['999'],
                                    },
                                ],
                            },
                        },
                    },
                    warehouseSqlBuilder: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toContain(replaceWhitespace(`WHERE (( ("table1".dim1) IN (999) ))`));
    });

    test('Should throw when invalid number is provided', () => {
        expect(() =>
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY,
                        filters: {
                            dimensions: {
                                id: '7e750e7c-8098-4a90-b364-4e935ad7a7e9',
                                and: [
                                    {
                                        id: 'd69d3ba0-6ff5-4437-9ef3-4ed69006ea2e',
                                        target: { fieldId: 'table1_dim1' },
                                        operator: FilterOperator.EQUALS,
                                        values: ['99) OR (1=1) --'],
                                    },
                                ],
                            },
                        },
                    },
                    warehouseSqlBuilder: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toThrow(
            'Invalid number value in filter: "99) OR (1=1) ". Expected a valid number.',
        );
    });

    test('Should return valid SQL filter with escaped quotes in postgres', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY,
                        filters: {
                            dimensions: {
                                id: '7e750e7c-8098-4a90-b364-4e935ad7a7e9',
                                and: [
                                    {
                                        id: 'd69d3ba0-6ff5-4437-9ef3-4ed69006ea2e',
                                        target: { fieldId: 'table1_shared' },
                                        operator: FilterOperator.EQUALS,
                                        values: ["\\') OR (1=1) --"],
                                    },
                                ],
                            },
                        },
                    },
                    warehouseSqlBuilder: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toContain(
            replaceWhitespace(
                `WHERE (( ("table1".shared) IN ('\\\\'') OR (1=1) ') ))`,
            ),
        );
    });
});

// Query Structure Tests
describe('Query Structure Tests', () => {
    // Helper function to build query with default props
    const buildTestQuery = (
        props: Partial<BuildQueryProps> & { compiledMetricQuery: AnyType },
    ): CompiledQuery =>
        buildQuery({
            explore: EXPLORE,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
            ...props,
        });

    test('Case 1: Just a metric', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: undefined,
                    tableCalculations: undefined,
                },
                tableCalculations: [], // Override existing table calculations
                compiledTableCalculations: [], // Override existing compiled table calculations
            },
        });

        // Should NOT have WITH clause
        expect(result.query).not.toContain('WITH');

        // Should have direct SELECT with metric
        expect(result.query).toContain('SELECT');
        expect(result.query).toContain(
            'MAX("table1".number_column) AS "table1_metric1"',
        );
        expect(result.query).toContain(
            'FROM "db"."schema"."table1" AS "table1"',
        );
        expect(result.query).toContain('GROUP BY');
    });

    test('Case 2: Metric + metric filter', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: undefined,
                },
                tableCalculations: [], // Override existing table calculations
                compiledTableCalculations: [], // Override existing compiled table calculations
            },
        });

        // Should have WITH metrics CTE only (no metric_filters CTE)
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');
        expect(result.query).not.toContain('metric_filters AS (');

        // TODO: should not contain table_calculations CTE
        // TODO: should contain no tc_ ctes
        // TODO: should not contain metric_filters CTE

        // Should not contain table_calculations CTE (no table calculations)
        expect(result.query).not.toContain('table_calculations AS (');

        // Should contain no tc_ CTEs (no dependent table calculations)
        expect(result.query).not.toContain('tc_');

        // Should not contain metric_filters CTE (handled inline)
        expect(result.query).not.toContain('metric_filters AS (');

        // Should have final SELECT directly FROM metrics with WHERE (not from metric_filters)
        expect(result.query).toContain('SELECT\n  *\nFROM metrics');
        expect(result.query).not.toContain('FROM metric_filters');
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('IS NOT NULL');
    });

    test('Case 3: Metric + metric filter + simple TC - should optimize simple TC to final SELECT', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: undefined,
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                ],
            },
        });

        // Should have WITH metrics CTE only
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');

        expect(result.query).not.toContain('table_calculations AS (');
        expect(result.query).not.toContain('tc_simple_tc AS (');

        // Should not contain metric_filters CTE (filters handled inline)
        expect(result.query).not.toContain('metric_filters AS (');

        // Should have simple TC directly in final SELECT
        expect(result.query).toContain('"table1_metric1" AS "simple_tc"');
        expect(result.query).toContain('FROM metrics');
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('IS NOT NULL');
    });
    test('Case 4: Metric + metric filter + simple TC + simple TC filter', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'tc-filter-id',
                                target: { fieldId: 'simple_tc' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                ],
            },
        });

        // Should have WITH metrics and table_calculations CTE (needed because of TC filter)
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).not.toContain('metric_filters AS (');

        // Should not contain metric_filters CTE (metric filters included in table_calculations CTE)
        expect(result.query).not.toContain('metric_filters AS (');

        // Should have simple TC in table_calculations CTE
        expect(result.query).toContain('"table1_metric1" AS "simple_tc"');
        expect(result.query).toContain('FROM table_calculations');

        // Should select from table_calculations CTE (not metrics)
        expect(result.query).toContain('SELECT\n  *\nFROM table_calculations');
        expect(result.query).toContain('WHERE');

        // Metric filter should be in table_calculations CTE, table calc filter in final WHERE
        expect(result.query).toContain('"table1_metric1"'); // metric filter

        // Should contain the specific table calculation filter
        expect(result.query).toContain('"simple_tc"'); // table calc filter
        expect(result.query).toContain('IS NOT NULL');
    });
    test('Case 5: Metric + metric filter + simple TC + dependent TCs - should create full CTE chain', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: undefined,
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: '"depended_on" + 10',
                        dependsOn: ['depended_on'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> table_calculations -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).toContain('tc_depended_on AS (');
        expect(result.query).toContain('tc_dependent AS (');

        // Final SELECT should be from the last CTE
        expect(result.query).toContain('FROM tc_dependent');

        // Should have metric filter in metric_filters CTE
        expect(result.query).toContain('IS NOT NULL');

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tableCalculationsIndex = result.query.indexOf(
            'table_calculations AS (',
        );
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tableCalculationsIndex);
        expect(tableCalculationsIndex).toBeLessThan(dependedOnIndex);
        expect(dependedOnIndex).toBeLessThan(dependentIndex);
    });
    test('Case 6: Metric + metric filter + simple TC + simple TC filter + dependent TCs', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'tc-filter-id',
                                target: { fieldId: 'simple_tc' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: '"depended_on" + 10',
                        dependsOn: ['depended_on'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> table_calculations -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).toContain('tc_depended_on AS (');
        expect(result.query).toContain('tc_dependent AS (');

        // Final SELECT should be from the last CTE
        expect(result.query).toContain('FROM tc_dependent');

        // Should have metric filter in metric_filters CTE
        const metricFiltersMatch = result.query.match(
            /metric_filters AS \(([\s\S]*?)\n\s*\),/,
        );
        expect(metricFiltersMatch).toBeTruthy();
        expect(metricFiltersMatch![1]).toContain('IS NOT NULL');

        // Should have table calc filter in final WHERE clause
        const finalWhereIndex = result.query.lastIndexOf('WHERE');
        const finalWhereClause = result.query.substring(finalWhereIndex);
        expect(finalWhereClause).toContain('"simple_tc"');
        expect(finalWhereClause).toContain('IS NOT NULL');

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tableCalculationsIndex = result.query.indexOf(
            'table_calculations AS (',
        );
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tableCalculationsIndex);
        expect(tableCalculationsIndex).toBeLessThan(dependedOnIndex);
        expect(dependedOnIndex).toBeLessThan(dependentIndex);
    });
    test('Case 7: Metric + metric filter + simple TC + simple TC filter + dependent TCs + dependent TC filter', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'simple-tc-filter-id',
                                target: { fieldId: 'simple_tc' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                            {
                                id: 'dependent-tc-filter-id',
                                target: { fieldId: 'dependent' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: '"depended_on" + 10',
                        dependsOn: ['depended_on'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> table_calculations -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).toContain('tc_depended_on AS (');
        expect(result.query).toContain('tc_dependent AS (');

        // Final SELECT should be from the last CTE
        expect(result.query).toContain('FROM tc_dependent');

        // Should have metric filter in metric_filters CTE
        const metricFiltersMatch = result.query.match(
            /metric_filters AS \(([\s\S]*?)\n\s*\),/,
        );
        expect(metricFiltersMatch).toBeTruthy();
        expect(metricFiltersMatch![1]).toContain('IS NOT NULL');

        // Should have table calc filters in final WHERE clause
        const finalWhereIndex = result.query.lastIndexOf('WHERE');
        const finalWhereClause = result.query.substring(finalWhereIndex);
        expect(finalWhereClause).toContain('"simple_tc"');
        expect(finalWhereClause).toContain('"dependent"');
        expect(finalWhereClause).toContain('IS NOT NULL');
        expect(finalWhereClause).toContain('AND'); // both table calc filters combined

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tableCalculationsIndex = result.query.indexOf(
            'table_calculations AS (',
        );
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tableCalculationsIndex);
        expect(tableCalculationsIndex).toBeLessThan(dependedOnIndex);
        expect(dependedOnIndex).toBeLessThan(dependentIndex);
    });

    test('Case 8: Metric + metric filter + dependent TCs + TC filter - should create full chain with all filters', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [20],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'tc-filter-id',
                                target: { fieldId: 'tc_a' },
                                operator: FilterOperator.EQUALS,
                                values: [1],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'tc_a',
                        displayName: 'TC A',
                        sql: '${table1.metric1} + 1',
                    },
                    {
                        name: 'tc_b',
                        displayName: 'TC B',
                        sql: '${tc_a} + 1',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'tc_a',
                        displayName: 'TC A',
                        sql: '${table1.metric1} + 1',
                        compiledSql: '"table1_metric1" + 1',
                        dependsOn: [],
                    },
                    {
                        name: 'tc_b',
                        displayName: 'TC B',
                        sql: '${tc_a} + 1',
                        compiledSql: '"tc_a" + 1',
                        dependsOn: ['tc_a'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> tc_a -> tc_b
        expect(result.query).toContain('WITH metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('tc_tc_a AS (');
        expect(result.query).toContain('tc_tc_b AS (');

        // Should select from the final dependent CTE
        expect(result.query).toContain('FROM tc_tc_b');

        // Should have metric filter in metric_filters CTE
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('"table1_metric1"');
        expect(result.query).toContain('> (20)');

        // Should have table calculation filter in final WHERE clause
        expect(result.query).toContain('"tc_a"');
        expect(result.query).toContain("IN ('1')");

        // Should properly reference tc_a in tc_b
        expect(result.query).toContain('"tc_a" + 1');

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tcAIndex = result.query.indexOf('tc_tc_a AS (');
        const tcBIndex = result.query.indexOf('tc_tc_b AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tcAIndex);
        expect(tcAIndex).toBeLessThan(tcBIndex);
    });

    test('Should return NULL for table calculations with pivot functions', () => {
        const metricQueryWithPivotTableCalcs = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'pivot_calc_offset',
                    displayName: 'Pivot Calculation with Offset',
                    sql: 'revenue - pivot_offset(revenue, -1)',
                },
                {
                    name: 'pivot_calc_column',
                    displayName: 'Pivot Calculation with Column',
                    sql: 'pivot_column()',
                },
                {
                    name: 'normal_calc',
                    displayName: 'Normal Calculation',
                    sql: '${table1.metric1} * 2',
                },
                {
                    name: 'row_calc',
                    displayName: 'Row Calculation',
                    sql: 'offset(${table1.metric1}, -1)',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pivot_calc_offset',
                    displayName: 'Pivot Calculation with Offset',
                    sql: 'revenue - pivot_offset(revenue, -1)',
                    compiledSql: 'revenue - pivot_offset(revenue, -1)',
                    dependsOn: [],
                },
                {
                    name: 'pivot_calc_column',
                    displayName: 'Pivot Calculation with Column',
                    sql: 'pivot_column()',
                    compiledSql: 'pivot_column()',
                    dependsOn: [],
                },
                {
                    name: 'normal_calc',
                    displayName: 'Normal Calculation',
                    sql: '${table1.metric1} * 2',
                    compiledSql: '"table1_metric1" * 2',
                    dependsOn: [],
                },
                {
                    name: 'row_calc',
                    displayName: 'Row Calculation',
                    sql: 'offset(${table1.metric1}, -1)',
                    compiledSql: 'offset("table1_metric1", -1)',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithPivotTableCalcs,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should return NULL for table calculations with pivot functions (case-insensitive)
        expect(result.query.toLowerCase()).toContain(
            'null as "pivot_calc_offset"',
        );
        expect(result.query.toLowerCase()).toContain(
            'null as "pivot_calc_column"',
        );

        // Should return normal SQL for table calculations without pivot functions
        expect(result.query).toContain('"table1_metric1" * 2 AS "normal_calc"');
        // Row functions should be compiled to SQL window functions
        expect(result.query).toContain(
            'LAG("table1_metric1", 1) OVER (ORDER BY "table1_metric1" DESC) AS "row_calc"',
        );

        // Verify that the pivot function SQL is not in the query
        expect(result.query).not.toContain('pivot_offset(revenue, -1)');
        expect(result.query).not.toContain('pivot_column()');
    });

    test('Should return NULL for interdependent table calculations with pivot functions', () => {
        const metricQueryWithInterdependentPivotCalc = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'impressions',
                    displayName: 'Impressions',
                    sql: 'COALESCE(${table1.metric1}, 0)',
                },
                {
                    name: 'impressions_delta',
                    displayName: 'Impressions Delta',
                    sql: '${impressions} - pivot_offset(${impressions}, -1)',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'impressions',
                    displayName: 'Impressions',
                    sql: 'COALESCE(${table1.metric1}, 0)',
                    compiledSql: 'COALESCE(table1_metric1, 0)',
                    dependsOn: [],
                },
                {
                    name: 'impressions_delta',
                    displayName: 'Impressions Delta',
                    sql: '${impressions} - pivot_offset(${impressions}, -1)',
                    compiledSql: 'impressions - pivot_offset(impressions, -1)',
                    dependsOn: ['impressions'],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithInterdependentPivotCalc,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should contain the base impressions calculation
        expect(result.query).toContain('COALESCE(table1_metric1, 0)');
        expect(result.query).toContain('"impressions"');

        // Should return NULL for the interdependent pivot calc
        expect(result.query.toLowerCase()).toContain(
            'null as "impressions_delta"',
        );

        // Verify that the raw pivot_offset function is not in the query
        expect(result.query).not.toContain('pivot_offset');
    });

    test('Should build column_totals CTE when total() is used', () => {
        const metricQueryWithTotal = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.metric1} / total(${table1.metric1})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.metric1} / total(${table1.metric1})',
                    compiledSql: '"table1_metric1" / total("table1_metric1")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should have the column_totals CTE
        expect(result.query).toContain('column_totals AS (');
        // Should use the metric's compiledSql for aggregation
        expect(result.query).toContain(
            'MAX("table1".number_column) AS "table1_metric1__total"',
        );
        // Should have with_totals CTE joining column_totals
        expect(result.query).toContain('with_totals AS (');
        expect(result.query).toContain('CROSS JOIN column_totals');
        // Should replace total() with column alias in table calc
        expect(result.query).toContain('"table1_metric1__total"');
        // Should NOT contain the raw total() call
        expect(result.query).not.toContain('total("table1_metric1")');
    });

    test('Should build row_totals CTE when row_total() is used with pivot', () => {
        const metricQueryWithRowTotal = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'pct_of_row',
                    displayName: 'Pct of Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_of_row',
                    displayName: 'Pct of Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                    compiledSql:
                        '"table1_metric1" / row_total("table1_metric1")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithRowTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
            pivotConfiguration: {
                indexColumn: [
                    {
                        reference: 'table1_dim1',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [],
                groupByColumns: undefined,
                sortBy: undefined,
            },
        });

        // Should have the row_totals CTE
        expect(result.query).toContain('row_totals AS (');
        // Should SUM the already-computed metric values (row totals are always SUM)
        expect(result.query).toContain(
            'SUM("table1_metric1") AS "table1_metric1__row_total"',
        );
        // Should read from the grouped results CTE, not from raw tables
        expect(result.query).not.toMatch(
            /row_totals AS \([^)]*FROM "postgres"\."schema"\."table1"/s,
        );
        // Should GROUP BY the non-pivot dimension
        expect(result.query).toContain('GROUP BY 1');
        // Should have with_totals CTE with LEFT JOIN on dimension
        expect(result.query).toContain('with_totals AS (');
        expect(result.query).toContain('LEFT JOIN row_totals ON');
        // Should replace row_total() with column alias
        expect(result.query).toContain('"table1_metric1__row_total"');
        expect(result.query).not.toContain('row_total("table1_metric1")');
    });

    test('Should build both column_totals and row_totals when both are used', () => {
        const metricQueryWithBothTotals = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'pct_total',
                    displayName: 'Pct Total',
                    sql: '${table1.metric1} / total(${table1.metric1})',
                },
                {
                    name: 'pct_row',
                    displayName: 'Pct Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_total',
                    displayName: 'Pct Total',
                    sql: '${table1.metric1} / total(${table1.metric1})',
                    compiledSql: '"table1_metric1" / total("table1_metric1")',
                    dependsOn: [],
                },
                {
                    name: 'pct_row',
                    displayName: 'Pct Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                    compiledSql:
                        '"table1_metric1" / row_total("table1_metric1")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithBothTotals,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
            pivotConfiguration: {
                indexColumn: [
                    {
                        reference: 'table1_dim1',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [],
                groupByColumns: undefined,
                sortBy: undefined,
            },
        });

        // Should have both totals CTEs
        expect(result.query).toContain('column_totals AS (');
        expect(result.query).toContain('row_totals AS (');
        expect(result.query).toContain('with_totals AS (');

        // Should have CROSS JOIN for column_totals and LEFT JOIN for row_totals
        expect(result.query).toContain('CROSS JOIN column_totals');
        expect(result.query).toContain('LEFT JOIN row_totals ON');

        // Both replacements should be present
        expect(result.query).toContain('"table1_metric1__total"');
        expect(result.query).toContain('"table1_metric1__row_total"');
    });

    test('Should handle total() in dependent table calculations', () => {
        const metricQueryWithTotalDependentCalc = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'pct_total',
                    displayName: 'Pct Total',
                    sql: '${table1.metric1} / total(${table1.metric1})',
                },
                {
                    name: 'double_pct',
                    displayName: 'Double Pct',
                    sql: '${pct_total} * 2',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_total',
                    displayName: 'Pct Total',
                    sql: '${table1.metric1} / total(${table1.metric1})',
                    compiledSql: '"table1_metric1" / total("table1_metric1")',
                    dependsOn: [],
                },
                {
                    name: 'double_pct',
                    displayName: 'Double Pct',
                    sql: '${pct_total} * 2',
                    compiledSql: '"pct_total" * 2',
                    dependsOn: ['pct_total'],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithTotalDependentCalc,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should have column_totals and with_totals CTEs
        expect(result.query).toContain('column_totals AS (');
        expect(result.query).toContain('with_totals AS (');

        // Should have dependent table calc CTE
        expect(result.query).toContain('tc_pct_total AS (');
        expect(result.query).toContain('tc_double_pct AS (');

        // total() should be replaced in the dependent CTE
        expect(result.query).toContain('"table1_metric1__total"');
        expect(result.query).not.toContain('total("table1_metric1")');
    });

    test('Should fall back row_total() to field reference when no pivot configuration', () => {
        const metricQueryWithRowTotalNoPivot = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'pct_of_row',
                    displayName: 'Pct of Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_of_row',
                    displayName: 'Pct of Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                    compiledSql:
                        '"table1_metric1" / row_total("table1_metric1")',
                    dependsOn: [],
                },
            ],
        };

        // No pivotConfiguration passed
        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithRowTotalNoPivot,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should NOT build row_totals CTE
        expect(result.query).not.toContain('row_totals AS (');
        // row_total("field") should be replaced with just "field" (identity fallback)
        expect(result.query).not.toContain('row_total("table1_metric1")');
        expect(result.query).not.toContain('"table1_metric1__row_total"');
        // The field reference itself should still be present
        expect(result.query).toContain('"table1_metric1"');
    });

    test('Should not build totals CTEs when total() is not used', () => {
        const metricQueryWithoutTotal = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'simple_calc',
                    displayName: 'Simple Calc',
                    sql: '${table1.metric1} + 100',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'simple_calc',
                    displayName: 'Simple Calc',
                    sql: '${table1.metric1} + 100',
                    compiledSql: '"table1_metric1" + 100',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithoutTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should NOT have any totals CTEs
        expect(result.query).not.toContain('column_totals AS (');
        expect(result.query).not.toContain('row_totals AS (');
        expect(result.query).not.toContain('with_totals AS (');
    });

    /**
     * Imagine "Avg Order Value" grouped by month: Jan=$50, Feb=$80, Mar=$60.
     * A naive SUM of those averages gives $190 — meaningless.
     * total() must go back to the raw orders table and run AVG(order_value)
     * across ALL rows (e.g. $62), not SUM the already-grouped averages.
     *
     * This test proves the column_totals CTE contains AVG(...), not SUM(...).
     */
    test('Should use AVG aggregation in column_totals for average metrics (not SUM)', () => {
        const exploreWithAvgMetric: Explore = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    metrics: {
                        ...EXPLORE.tables.table1.metrics,
                        avg_metric: {
                            type: MetricType.AVERAGE,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'avg_metric',
                            label: 'avg_metric',
                            sql: '${TABLE}.number_column',
                            compiledSql: 'AVG("table1".number_column)',
                            tablesReferences: ['table1'],
                            hidden: false,
                        } as CompiledMetric,
                    },
                },
            },
        };

        const metricQueryWithAvgTotal = {
            ...METRIC_QUERY,
            metrics: ['table1_avg_metric'],
            tableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.avg_metric} / total(${table1.avg_metric})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.avg_metric} / total(${table1.avg_metric})',
                    compiledSql:
                        '"table1_avg_metric" / total("table1_avg_metric")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: exploreWithAvgMetric,
            compiledMetricQuery: metricQueryWithAvgTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Must use AVG, not SUM — re-aggregates from raw data
        expect(result.query).toContain(
            'AVG("table1".number_column) AS "table1_avg_metric__total"',
        );
        expect(result.query).not.toMatch(
            /SUM\("table1"\.number_column\).*AS "table1_avg_metric__total"/,
        );
    });

    /**
     * Unique customers per region: North=80, South=70, East=60.
     * Some customers shop in multiple regions. Summing gives 210,
     * but the true distinct count might be 150.
     *
     * total() must re-run COUNT(DISTINCT user_id) across all raw data
     * so shared customers are only counted once.
     */
    test('Should use COUNT(DISTINCT) aggregation in column_totals for count_distinct metrics', () => {
        const exploreWithCountDistinctMetric: Explore = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    metrics: {
                        ...EXPLORE.tables.table1.metrics,
                        unique_users: {
                            type: MetricType.COUNT_DISTINCT,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'unique_users',
                            label: 'unique_users',
                            sql: '${TABLE}.user_id',
                            compiledSql: 'COUNT(DISTINCT "table1".user_id)',
                            tablesReferences: ['table1'],
                            hidden: false,
                        } as CompiledMetric,
                    },
                },
            },
        };

        const metricQueryWithCountDistinctTotal = {
            ...METRIC_QUERY,
            metrics: ['table1_unique_users'],
            tableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.unique_users} / total(${table1.unique_users})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.unique_users} / total(${table1.unique_users})',
                    compiledSql:
                        '"table1_unique_users" / total("table1_unique_users")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: exploreWithCountDistinctMetric,
            compiledMetricQuery: metricQueryWithCountDistinctTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(result.query).toContain(
            'COUNT(DISTINCT "table1".user_id) AS "table1_unique_users__total"',
        );
    });

    /**
     * Custom SQL metric "Revenue Per Order" = SUM(revenue) / COUNT(order_id).
     * This is a ratio of two aggregations, not a simple AVG.
     *
     * total() must use the full compiled expression — running both
     * SUM and COUNT against raw data — not just SUM the pre-computed ratios.
     */
    test('Should use full compiled expression in column_totals for custom SQL (number) metrics', () => {
        const exploreWithCustomMetric: Explore = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    metrics: {
                        ...EXPLORE.tables.table1.metrics,
                        revenue_per_order: {
                            type: MetricType.NUMBER,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'revenue_per_order',
                            label: 'revenue_per_order',
                            sql: '${total_revenue} / ${order_count}',
                            compiledSql:
                                'SUM("table1".revenue) / COUNT("table1".order_id)',
                            tablesReferences: ['table1'],
                            hidden: false,
                        } as CompiledMetric,
                    },
                },
            },
        };

        const metricQueryWithCustomTotal = {
            ...METRIC_QUERY,
            metrics: ['table1_revenue_per_order'],
            tableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.revenue_per_order} / total(${table1.revenue_per_order})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_of_total',
                    displayName: 'Pct of Total',
                    sql: '${table1.revenue_per_order} / total(${table1.revenue_per_order})',
                    compiledSql:
                        '"table1_revenue_per_order" / total("table1_revenue_per_order")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: exploreWithCustomMetric,
            compiledMetricQuery: metricQueryWithCustomTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Custom SQL metric should use its full compiledSql with embedded aggregations
        expect(result.query).toContain(
            'SUM("table1".revenue) / COUNT("table1".order_id) AS "table1_revenue_per_order__total"',
        );
    });

    /**
     * Two metrics in one query: Total Revenue (SUM) and Avg Order Value (AVG).
     * Both use total() in table calculations.
     *
     * The single column_totals CTE must contain BOTH SUM(revenue) AND
     * AVG(order_value) — each metric gets its own correct aggregation,
     * they don't all default to SUM.
     */
    test('Should use correct aggregation per metric when multiple metric types use total()', () => {
        const exploreWithMultipleMetrics: Explore = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    metrics: {
                        ...EXPLORE.tables.table1.metrics,
                        total_revenue: {
                            type: MetricType.SUM,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'total_revenue',
                            label: 'total_revenue',
                            sql: '${TABLE}.revenue',
                            compiledSql: 'SUM("table1".revenue)',
                            tablesReferences: ['table1'],
                            hidden: false,
                        } as CompiledMetric,
                        avg_order_value: {
                            type: MetricType.AVERAGE,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'avg_order_value',
                            label: 'avg_order_value',
                            sql: '${TABLE}.order_value',
                            compiledSql: 'AVG("table1".order_value)',
                            tablesReferences: ['table1'],
                            hidden: false,
                        } as CompiledMetric,
                    },
                },
            },
        };

        const metricQueryWithMultipleTotals = {
            ...METRIC_QUERY,
            metrics: ['table1_total_revenue', 'table1_avg_order_value'],
            tableCalculations: [
                {
                    name: 'revenue_pct',
                    displayName: 'Revenue %',
                    sql: '${table1.total_revenue} / total(${table1.total_revenue})',
                },
                {
                    name: 'avg_pct',
                    displayName: 'Avg %',
                    sql: '${table1.avg_order_value} / total(${table1.avg_order_value})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'revenue_pct',
                    displayName: 'Revenue %',
                    sql: '${table1.total_revenue} / total(${table1.total_revenue})',
                    compiledSql:
                        '"table1_total_revenue" / total("table1_total_revenue")',
                    dependsOn: [],
                },
                {
                    name: 'avg_pct',
                    displayName: 'Avg %',
                    sql: '${table1.avg_order_value} / total(${table1.avg_order_value})',
                    compiledSql:
                        '"table1_avg_order_value" / total("table1_avg_order_value")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: exploreWithMultipleMetrics,
            compiledMetricQuery: metricQueryWithMultipleTotals,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // SUM metric should use SUM in column_totals
        expect(result.query).toContain(
            'SUM("table1".revenue) AS "table1_total_revenue__total"',
        );
        // AVG metric should use AVG in column_totals (not SUM)
        expect(result.query).toContain(
            'AVG("table1".order_value) AS "table1_avg_order_value__total"',
        );
    });

    /**
     * "Avg Order Value" pivoted by region: North=$50, South=$45, East=$60.
     * row_total() gives $50+$45+$60 = $155 — a SUM of the averages.
     *
     * This is mathematically questionable (summing averages), but it's the
     * spec: row_total is always SUM regardless of metric type. This test
     * documents that intentional design choice so it isn't accidentally
     * "fixed" to use AVG later without a deliberate decision.
     *
     * Looker differs here — it lets users choose the aggregation function
     * for row totals (mean, max, min, etc. via pivot_row()).
     */
    test('Should always SUM in row_totals regardless of metric type (by design)', () => {
        const exploreWithAvgMetric: Explore = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    metrics: {
                        ...EXPLORE.tables.table1.metrics,
                        avg_metric: {
                            type: MetricType.AVERAGE,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'avg_metric',
                            label: 'avg_metric',
                            sql: '${TABLE}.number_column',
                            compiledSql: 'AVG("table1".number_column)',
                            tablesReferences: ['table1'],
                            hidden: false,
                        } as CompiledMetric,
                    },
                },
            },
        };

        const metricQueryWithAvgRowTotal = {
            ...METRIC_QUERY,
            metrics: ['table1_avg_metric'],
            tableCalculations: [
                {
                    name: 'row_sum',
                    displayName: 'Row Sum',
                    sql: 'row_total(${table1.avg_metric})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'row_sum',
                    displayName: 'Row Sum',
                    sql: 'row_total(${table1.avg_metric})',
                    compiledSql: 'row_total("table1_avg_metric")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: exploreWithAvgMetric,
            compiledMetricQuery: metricQueryWithAvgRowTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
            pivotConfiguration: {
                indexColumn: [
                    {
                        reference: 'table1_dim1',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [],
                groupByColumns: undefined,
                sortBy: undefined,
            },
        });

        // row_total always uses SUM of grouped values, even for AVG metrics
        expect(result.query).toContain(
            'SUM("table1_avg_metric") AS "table1_avg_metric__row_total"',
        );
        // Should NOT use AVG for row totals
        expect(result.query).not.toMatch(
            /AVG\("table1_avg_metric"\).*AS "table1_avg_metric__row_total"/,
        );
    });

    test('Should build row_totals CTE using pivotDimensions (lightweight alternative to pivotConfiguration)', () => {
        const metricQueryWithRowTotal = {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'pct_of_row',
                    displayName: 'Pct of Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                },
            ],
            compiledTableCalculations: [
                {
                    name: 'pct_of_row',
                    displayName: 'Pct of Row',
                    sql: '${table1.metric1} / row_total(${table1.metric1})',
                    compiledSql:
                        '"table1_metric1" / row_total("table1_metric1")',
                    dependsOn: [],
                },
            ],
        };

        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: metricQueryWithRowTotal,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
            // Use pivotDimensions instead of pivotConfiguration
            pivotDimensions: ['table1_dim2'],
        });

        // Should have the row_totals CTE
        expect(result.query).toContain('row_totals AS (');
        // Should SUM from grouped results
        expect(result.query).toContain(
            'SUM("table1_metric1") AS "table1_metric1__row_total"',
        );
        // Non-pivot dim (table1_dim1) should be in GROUP BY
        expect(result.query).toContain('"table1_dim1"');
        expect(result.query).toContain('GROUP BY 1');
        // Should have with_totals CTE
        expect(result.query).toContain('with_totals AS (');
        expect(result.query).toContain('LEFT JOIN row_totals ON');
        // Should replace row_total() with column alias
        expect(result.query).toContain('"table1_metric1__row_total"');
        expect(result.query).not.toContain('row_total("table1_metric1")');
    });
});

describe('Date zoom with filters', () => {
    test('Should use raw column in WHERE clause when date zoom is active', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_DATE_DIMENSION_ZOOMED,
            compiledMetricQuery: METRIC_QUERY_WITH_DATE_FILTER,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
            originalExplore: EXPLORE_WITH_DATE_DIMENSION,
        });

        expect(result.query).toContain(
            `DATE_TRUNC('month', "orders".created_at) AS "orders_created_at"`,
        );
        expect(result.query).toContain(
            `("orders".created_at) >= ('2024-09-01')`,
        );
        expect(result.query).toContain(
            `("orders".created_at) <= ('2024-09-04')`,
        );
        expect(result.query).not.toContain(
            `DATE_TRUNC('month', "orders".created_at) >= ('2024-09-01')`,
        );
    });

    test('Should use DATE_TRUNC in WHERE clause without originalExplore (no date zoom)', () => {
        // Without originalExplore, the zoomed explore is used for both SELECT and WHERE
        // This verifies backwards compatibility: when no date zoom, filters use the explore as-is
        const result = buildQuery({
            explore: EXPLORE_WITH_DATE_DIMENSION,
            compiledMetricQuery: METRIC_QUERY_WITH_DATE_FILTER,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });
        // Without date zoom, both SELECT and WHERE use the raw column
        expect(result.query).toContain('"orders".created_at');
        expect(result.query).not.toContain('DATE_TRUNC');
    });
});

describe('Default sort behavior', () => {
    test('Should apply default sort by time dimension DESC when no sorts are specified', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_DATE_DIMENSION,
            compiledMetricQuery: {
                ...METRIC_QUERY,
                dimensions: ['orders_created_at'],
                metrics: ['orders_order_count'],
                sorts: [], // No sorts specified
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should apply default sort by date dimension descending
        expect(result.query).toContain('ORDER BY');
        expect(result.query).toContain('"orders_created_at" DESC');
    });

    test('Should apply default sort by first metric DESC when no time dimension', () => {
        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY,
                dimensions: ['table1_dim1'],
                metrics: ['table1_metric1'],
                sorts: [], // No sorts specified
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should apply default sort by first metric descending
        expect(result.query).toContain('ORDER BY');
        expect(result.query).toContain('"table1_metric1" DESC');
    });

    test('Should apply default sort by first dimension ASC when only dimensions', () => {
        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY,
                dimensions: ['table1_dim1'],
                metrics: [],
                sorts: [], // No sorts specified
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should apply default sort by first dimension ascending
        expect(result.query).toContain('ORDER BY');
        expect(result.query).toContain('"table1_dim1"');
        expect(result.query).not.toContain('"table1_dim1" DESC');
    });

    test('Should not apply default sort when sorts are already specified', () => {
        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY,
                dimensions: ['table1_dim1'],
                metrics: ['table1_metric1'],
                sorts: [
                    {
                        fieldId: 'table1_dim1',
                        descending: true,
                    },
                ],
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should use the specified sort, not the default
        expect(result.query).toContain('ORDER BY');
        expect(result.query).toContain('"table1_dim1" DESC');
        // Should not contain the default metric sort
        expect(result.query).not.toContain('"table1_metric1" DESC');
    });

    test('Should have no ORDER BY when no dimensions and no metrics', () => {
        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY,
                dimensions: [],
                metrics: [],
                sorts: [],
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should have no ORDER BY clause at all
        expect(result.query).not.toContain('ORDER BY');
    });

    test('Should have no ORDER BY when no dimensions but metrics present (e.g. calculate total)', () => {
        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY,
                dimensions: [],
                metrics: ['table1_metric1'],
                sorts: [],
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // No dimensions means single aggregated row, ORDER BY is meaningless
        expect(result.query).not.toContain('ORDER BY');
    });
});

describe('Nested aggregate metrics', () => {
    test('should generate nested_agg CTE for metrics with nested aggregates and dimensions', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_WITH_DIMS,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should contain both CTEs
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');
        // CTE 1 should compute the inner metric
        expect(result.query).toContain(
            'MAX("my_table".value) AS "my_table_max_value"',
        );
        // Final query should NOT contain nested aggregate
        expect(result.query).not.toContain('SUM(MAX(');
        // Results CTE should reference CTE 1 columns
        expect(result.query).toContain('nested_agg."my_table_max_value"');
        // Outer SELECT should reference nested_agg_results (no aggregates)
        expect(result.query).toContain('INNER JOIN nested_agg_results ON');
        expect(result.query).toContain(
            'nested_agg_results."my_table_sum_of_max"',
        );
    });

    test('should select FROM nested_agg when no dimensions are selected', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_NO_DIMS,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).not.toContain('SUM(MAX(');
        // With no dimensions and no other metrics, selects directly from the CTE
        expect(result.query).toContain('FROM nested_agg');
    });

    test('should handle complex nested aggregate with mixed refs (agg + non-agg)', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_COMPLEX,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should contain the nested_agg CTE
        expect(result.query).toContain('nested_agg AS (');
        // Should NOT contain nested aggregate
        expect(result.query).not.toContain('SUM(MAX(');
        // The count_records metric ref (non-nested) should still compile normally
        expect(result.query).toContain('COUNT("my_table".id)');
    });

    test('should handle COUNT(DISTINCT) wrapping aggregate metric (PROD-5657)', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_COUNT_DISTINCT,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should contain both CTEs
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');
        // CTE 1 should compute the inner metric
        expect(result.query).toContain(
            'MAX("my_table".value) AS "my_table_max_value"',
        );
        // Should NOT contain nested aggregate COUNT(DISTINCT MAX(...))
        expect(result.query).not.toContain('COUNT(DISTINCT MAX(');
        // Results CTE should reference CTE 1 columns
        expect(result.query).toContain('nested_agg."my_table_max_value"');
        // Outer SELECT should reference nested_agg_results (no aggregates)
        expect(result.query).toContain(
            'nested_agg_results."my_table_count_distinct_of_max"',
        );
    });

    test('should handle conditional SUM wrapping aggregate metric', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_CONDITIONAL,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should contain the nested_agg CTE
        expect(result.query).toContain('nested_agg AS (');
        // Should NOT contain nested aggregate SUM(CASE WHEN MAX(...)...)
        expect(result.query).not.toContain('SUM(CASE WHEN MAX(');
        // Should reference the CTE column in the outer SQL
        expect(result.query).toContain('nested_agg."my_table_max_value"');
    });

    test('should NOT generate CTE for product of aggregates (no outer aggregation)', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_PRODUCT,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should NOT contain nested_agg CTE — no outer aggregation wrapping
        expect(result.query).not.toContain('nested_agg AS (');
        // SQL is valid: MAX(...) * COUNT(...) — sibling aggregates, not nested
        expect(result.query).toContain('MAX("my_table".value)');
        expect(result.query).toContain('COUNT("my_table".id)');
    });

    test('should route non-wrapping aggregate-referencing metrics through CTE when mixed with wrapping metrics', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_MIXED,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should contain both CTEs
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');
        // Should NOT contain nested aggregate
        expect(result.query).not.toContain('SUM(MAX(');
        // Results CTE should compute product_of_aggregates using CTE refs
        expect(result.query).toContain('nested_agg."my_table_max_value"');
        // Outer SELECT should reference nested_agg_results columns (no aggregates)
        expect(result.query).toContain(
            'nested_agg_results."my_table_product_of_aggregates"',
        );
        expect(result.query).toContain(
            'nested_agg_results."my_table_sum_of_max"',
        );
    });

    test('should NOT route raw column aggregation + metric ref through CTE (sum(raw_col) / ${metric})', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_RAW_COL,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // The raw_agg_with_ref metric (sum(raw_col) / ${count_records}) should NOT
        // be in the nested_agg_results CTE because its sum() wraps a raw column,
        // not a metric reference. It's valid SQL as-is: SUM(col) / COUNT(col).
        // The sum_of_max metric should still use the CTE.
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');
        // sum_of_max should be in nested_agg_results
        expect(result.query).toContain(
            'nested_agg_results."my_table_sum_of_max"',
        );
        // raw_agg_with_ref should be compiled directly in na_base (not in nested_agg_results)
        // It should produce valid SQL: SUM("my_table".value) / NULLIF(COUNT("my_table".id), 0)
        expect(result.query).toContain('SUM("my_table".value)');
        expect(result.query).not.toContain(
            'nested_agg_results."my_table_raw_agg_with_ref"',
        );
    });

    test('should resolve ${TABLE} references to CTE alias inside nested_agg_results (GH-21089)', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_WINDOW_TABLE_REF,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should use nested CTE since window fn wraps aggregate metric ref
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');

        // CTE 1 should compute the inner metric from the base table
        expect(result.query).toContain(
            'MAX("my_table".value) AS "my_table_max_value"',
        );

        // BUG: Inside nested_agg_results, ${TABLE} resolves to "my_table"
        // but only "nested_agg" is in scope (FROM nested_agg).
        // This causes BigQuery to throw "Unrecognized name: my_table"
        expect(result.query).not.toContain('PARTITION BY "my_table".category');
        // The correct behavior: ${TABLE} should resolve to the CTE alias
        expect(result.query).toContain(
            'PARTITION BY nested_agg."my_table_category"',
        );
    });

    test('should handle transitive nested aggregates (type:number → type:number with agg → type:max)', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_TRANSITIVE,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should use nested CTE to break apart the transitive nesting
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');

        // CTE 1 should pre-compute the inner aggregate metric (max_value)
        expect(result.query).toContain(
            'MAX("my_table".value) AS "my_table_max_value"',
        );

        // Final SQL should NOT contain nested aggregates like SUM(CASE WHEN MAX(...))
        expect(result.query).not.toContain('SUM(CASE WHEN MAX(');
    });

    test('should handle transitive nested aggregates mixed with other nested metrics', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_TRANSITIVE_MIXED,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should use nested CTE
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');

        // CTE 1 should pre-compute leaf aggregates only
        expect(result.query).toContain(
            'MAX("my_table".value) AS "my_table_max_value"',
        );

        // No nested aggregation in the query (no SUM wrapping MAX)
        expect(result.query).not.toContain('SUM(CASE WHEN MAX(');

        // ratio_of_sum_case should reference CTE columns, not base table
        expect(result.query).toContain('nested_agg."my_table_max_value"');
    });

    test('should emit nested aggregate metric only once when fanout CTEs are also generated', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG_AND_FANOUT,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_WITH_FANOUT,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(result.query).toContain('cte_metrics_my_table AS (');
        expect(result.query).toContain('nested_agg_results AS (');
        expect(result.query).toContain(
            'nested_agg_results."my_table_sum_of_max"',
        );
        expect(result.query.match(/AS "my_table_sum_of_max"/g)).toHaveLength(1);
    });

    test('should emit cross-table nested aggregate metric only once when fanout CTEs are also generated', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG_AND_FANOUT,
            compiledMetricQuery:
                METRIC_QUERY_NESTED_AGG_WITH_FANOUT_CROSS_TABLE,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        expect(result.query).toContain('cte_metrics_my_table AS (');
        expect(result.query).toContain('nested_agg_results AS (');
        expect(result.query).toContain(
            'nested_agg_results."my_table_cross_table_sum_of_max"',
        );
        expect(
            result.query.match(/AS "my_table_cross_table_sum_of_max"/g),
        ).toHaveLength(1);
    });

    test('should handle mixed raw + aggregate inner deps via nested_agg_mixed CTE', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_MIXED_RAW,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // CTE 1 should only pre-compute the aggregate dep (max_value),
        // NOT the raw dep (raw_value) which would fail GROUP BY.
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain(
            'MAX("my_table".value) AS "my_table_max_value"',
        );
        // raw_value should NOT appear in CTE 1
        expect(result.query).not.toMatch(
            /nested_agg AS \([^)]*"my_table_raw_value"/,
        );

        // CTE 3 (nested_agg_mixed) should exist and join base table + CTE 1
        expect(result.query).toContain('nested_agg_mixed AS (');
        // The mixed metric should use base table raw column + CTE aggregate ref
        expect(result.query).toContain('nested_agg."my_table_max_value"');
        // Raw column should reference base table (inside ARRAY_AGG).
        // compileMetricReference wraps the resolved SQL in parens.
        expect(result.query).toContain('ARRAY_AGG(("my_table".value)');

        // CTE 2 (nested_agg_results) should NOT be created since there
        // are no pure-aggregate outer metrics
        expect(result.query).not.toContain('nested_agg_results AS (');

        // Final SELECT should reference nested_agg_mixed
        expect(result.query).toContain(
            'nested_agg_mixed."my_table_mixed_raw_agg_repro"',
        );

        // Should NOT contain nested aggregate (ARRAY_AGG wrapping MAX)
        expect(result.query).not.toContain('ORDER BY MAX(');
    });

    test('should handle mixed raw + aggregate alongside pure aggregate metric', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_MIXED_RAW_WITH_PURE,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Both CTE 2 and CTE 3 should exist
        expect(result.query).toContain('nested_agg AS (');
        expect(result.query).toContain('nested_agg_results AS (');
        expect(result.query).toContain('nested_agg_mixed AS (');

        // Pure aggregate metric (sum_of_max) in CTE 2
        expect(result.query).toContain(
            'nested_agg_results."my_table_sum_of_max"',
        );
        // Mixed metric in CTE 3
        expect(result.query).toContain(
            'nested_agg_mixed."my_table_mixed_raw_agg_repro"',
        );
    });

    test('should handle mixed raw + aggregate with no dimensions (CROSS JOIN path)', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_MIXED_RAW_NO_DIMS,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Should use nested_agg_mixed CTE
        expect(result.query).toContain('nested_agg_mixed AS (');
        // With no dimensions, should use CROSS JOIN
        expect(result.query).toContain('CROSS JOIN nested_agg');
        // Should NOT contain nested aggregate
        expect(result.query).not.toContain('ORDER BY MAX(');
    });

    test('should emit max_by nested aggregate metric only once when fanout CTEs are also generated', () => {
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG_AND_FANOUT,
            compiledMetricQuery: {
                ...METRIC_QUERY_NESTED_AGG_WITH_FANOUT,
                metrics: ['my_table_max_by_of_agg', 'my_table_count_records'],
                sorts: [
                    { fieldId: 'my_table_max_by_of_agg', descending: true },
                ],
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // The max_by metric should be emitted exactly once via nested_agg_results
        expect(result.query).toContain('nested_agg_results AS (');
        expect(result.query.match(/AS "my_table_max_by_of_agg"/g)).toHaveLength(
            1,
        );
    });

    test('should handle MAX_BY wrapping non-aggregate metric refs (customer pattern)', () => {
        // Customer pattern: MAX_BY(${type_number}, ${type_number}) where both
        // inner deps are non-aggregate. Previously CTE routing didn't activate
        // because it required at least one aggregate ref, causing raw column
        // references to leak into the SELECT and fail GROUP BY.
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: {
                exploreName: 'my_table',
                dimensions: ['my_table_category'],
                metrics: ['my_table_max_by_of_raw'],
                filters: {},
                sorts: [
                    { fieldId: 'my_table_max_by_of_raw', descending: true },
                ],
                limit: 10,
                tableCalculations: [],
                compiledTableCalculations: [],
                compiledAdditionalMetrics: [],
                compiledCustomDimensions: [],
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // CTE routing should activate — raw inner deps should NOT appear
        // as standalone SELECT entries (would fail GROUP BY).
        // The outer metric should be handled via nested_agg_mixed CTE
        // since inner deps are raw (non-aggregate).
        expect(result.query).toContain('nested_agg_mixed AS (');
        expect(result.query).toContain(
            'nested_agg_mixed."my_table_max_by_of_raw"',
        );
        // raw_value and raw_updated_on should NOT appear as standalone
        // SELECT entries in the regular query
        expect(result.query).not.toMatch(/na_base[^]*AS "my_table_raw_value"/);
        expect(result.query).not.toMatch(
            /na_base[^]*AS "my_table_raw_updated_on"/,
        );
    });

    test('should not duplicate aggregate inner deps that are also independently selected', () => {
        // Reproduces the customer bug: a nested metric like MAX_BY(${max_value}, ${count_records})
        // has aggregate inner deps (max_value, count_records). When count_records is also
        // independently selected as a metric, it was appearing twice in the SQL:
        // once from the CTE and once from the regular SELECT.
        const result = buildQuery({
            explore: EXPLORE_WITH_NESTED_AGG,
            compiledMetricQuery: {
                exploreName: 'my_table',
                dimensions: ['my_table_category'],
                // count_records is both an inner dep of sum_of_max AND independently selected
                metrics: ['my_table_sum_of_max', 'my_table_count_records'],
                filters: {},
                sorts: [{ fieldId: 'my_table_sum_of_max', descending: true }],
                limit: 10,
                tableCalculations: [],
                compiledTableCalculations: [],
                compiledAdditionalMetrics: [],
                compiledCustomDimensions: [],
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // count_records is an aggregate inner dep pre-computed in CTE 1.
        // It must NOT also appear in the regular SELECT (would cause duplicate column).
        expect(result.query.match(/AS "my_table_count_records"/g)).toHaveLength(
            1,
        );
        // max_value is also an aggregate inner dep, should appear only once
        expect(result.query.match(/AS "my_table_max_value"/g)).toHaveLength(1);
        // The outer metric should appear once via nested_agg_results
        expect(result.query.match(/AS "my_table_sum_of_max"/g)).toHaveLength(1);
    });

    test('should resolve short-form metric refs against the outer metric table when a joined table has a same-named aggregate (PROD-7503)', () => {
        // Repro: base table has a hidden helper `met_active_customers`
        // (raw column). Joined table has an aggregate metric with the SAME
        // name. The outer mixed metric `met_active_customers_agg` on the
        // base table uses `${met_active_customers}` (short form) which must
        // resolve to the base table's raw helper — NOT the joined table's
        // pre-computed AVG in the nested_agg CTE.
        const result = buildQuery({
            explore: EXPLORE_NESTED_AGG_NAME_COLLISION,
            compiledMetricQuery: METRIC_QUERY_NESTED_AGG_NAME_COLLISION,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // The mixed CTE's MAX_BY must reference the base table's raw column,
        // not the joined table's pre-aggregated value.
        // (compileMetricReference wraps resolved refs in parens.)
        expect(result.query).toContain(
            'MAX_BY(("base_tbl".active_customers), ("base_tbl".updated_on))',
        );
        // Negative: the buggy SQL referenced the joined table's CTE column
        // as the first argument to MAX_BY.
        expect(result.query).not.toMatch(
            /MAX_BY\(\s*nested_agg\."joined_tbl_met_active_customers"/,
        );

        // The pure-agg goal metric should still resolve correctly to the
        // joined-table CTE column.
        expect(result.query).toContain(
            'nested_agg."joined_tbl_met_active_customers" AS "base_tbl_met_active_customers_goal"',
        );
    });
});

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('Timezone-aware EXTRACT-based time dimensions', () => {
    const buildExtractExplore = (
        baseType: DimensionType,
        adapter: SupportedDbtAdapter = SupportedDbtAdapter.POSTGRES,
    ): Explore => ({
        targetDatabase: adapter,
        name: 'events',
        label: 'events',
        baseTable: 'events',
        tags: [],
        joinedTables: [],
        tables: {
            events: {
                name: 'events',
                label: 'events',
                database: 'db',
                schema: 's',
                sqlTable: '"events"',
                primaryKey: ['id'],
                dimensions: {
                    id: {
                        type: DimensionType.NUMBER,
                        name: 'id',
                        label: 'id',
                        table: 'events',
                        tableLabel: 'events',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.id',
                        compiledSql: '"events".id',
                        tablesReferences: ['events'],
                        hidden: false,
                    },
                    occurred_at: {
                        type: baseType,
                        name: 'occurred_at',
                        label: 'occurred_at',
                        table: 'events',
                        tableLabel: 'events',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.occurred_at',
                        compiledSql: '"events".occurred_at',
                        tablesReferences: ['events'],
                        hidden: false,
                    },
                    occurred_at_day_of_week_index: {
                        type: DimensionType.NUMBER,
                        name: 'occurred_at_day_of_week_index',
                        label: 'occurred_at_day_of_week_index',
                        table: 'events',
                        tableLabel: 'events',
                        fieldType: FieldType.DIMENSION,
                        sql: `DATE_PART('DOW', \${TABLE}.occurred_at)`,
                        // Compile-time UTC-only SQL (matches today's behavior)
                        compiledSql: `DATE_PART('DOW', "events".occurred_at)`,
                        tablesReferences: ['events'],
                        hidden: false,
                        timeInterval: TimeFrames.DAY_OF_WEEK_INDEX,
                        timeIntervalBaseDimensionName: 'occurred_at',
                    },
                    occurred_at_week_num: {
                        type: DimensionType.NUMBER,
                        name: 'occurred_at_week_num',
                        label: 'occurred_at_week_num',
                        table: 'events',
                        tableLabel: 'events',
                        fieldType: FieldType.DIMENSION,
                        sql: `DATE_PART('WEEK', \${TABLE}.occurred_at)`,
                        compiledSql: `DATE_PART('WEEK', "events".occurred_at)`,
                        tablesReferences: ['events'],
                        hidden: false,
                        timeInterval: TimeFrames.WEEK_NUM,
                        timeIntervalBaseDimensionName: 'occurred_at',
                    },
                    occurred_at_day_of_week_name: {
                        type: DimensionType.STRING,
                        name: 'occurred_at_day_of_week_name',
                        label: 'occurred_at_day_of_week_name',
                        table: 'events',
                        tableLabel: 'events',
                        fieldType: FieldType.DIMENSION,
                        sql: `TO_CHAR(\${TABLE}.occurred_at, 'FMDay')`,
                        compiledSql: `TO_CHAR("events".occurred_at, 'FMDay')`,
                        tablesReferences: ['events'],
                        hidden: false,
                        timeInterval: TimeFrames.DAY_OF_WEEK_NAME,
                        timeIntervalBaseDimensionName: 'occurred_at',
                    },
                },
                metrics: {
                    event_count: {
                        type: MetricType.COUNT,
                        fieldType: FieldType.METRIC,
                        table: 'events',
                        tableLabel: 'events',
                        name: 'event_count',
                        label: 'event_count',
                        sql: '${TABLE}.id',
                        compiledSql: 'COUNT("events".id)',
                        tablesReferences: ['events'],
                        hidden: false,
                    },
                },
                lineageGraph: {},
            },
        },
    });

    const baseDowQuery = (filterValues?: number[]): CompiledMetricQuery => ({
        exploreName: 'events',
        dimensions: ['events_occurred_at_day_of_week_index'],
        metrics: ['events_event_count'],
        filters: filterValues
            ? {
                  dimensions: {
                      id: 'root',
                      and: [
                          {
                              id: 'dow-eq',
                              target: {
                                  fieldId:
                                      'events_occurred_at_day_of_week_index',
                              },
                              operator: FilterOperator.EQUALS,
                              values: filterValues,
                          },
                      ],
                  },
              }
            : {},
        sorts: [],
        limit: 100,
        tableCalculations: [],
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
        compiledCustomDimensions: [],
    });

    test('TIMESTAMP base + flag on + non-UTC TZ wraps SELECT (Postgres)', () => {
        const { query } = buildQuery({
            explore: buildExtractExplore(DimensionType.TIMESTAMP),
            compiledMetricQuery: baseDowQuery(),
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: true,
        });
        expect(query).toContain(
            `DATE_PART('DOW', ("events".occurred_at)::timestamptz AT TIME ZONE 'America/New_York')`,
        );
        // Bare UTC SQL must not be present
        expect(query).not.toMatch(/DATE_PART\('DOW', "events"\.occurred_at\)/);
    });

    test('TIMESTAMP base + flag on + non-UTC TZ wraps WHERE filter LHS (Postgres)', () => {
        const { query } = buildQuery({
            explore: buildExtractExplore(DimensionType.TIMESTAMP),
            compiledMetricQuery: baseDowQuery([1]),
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: true,
        });
        // Both SELECT and WHERE LHS must use the wrapped expression so they
        // agree on what counts as e.g. Monday in the project zone.
        const wrappedSql = `DATE_PART('DOW', ("events".occurred_at)::timestamptz AT TIME ZONE 'America/New_York')`;
        expect(
            query.match(new RegExp(escapeRegExp(wrappedSql), 'g')),
        ).not.toBeNull();
        expect(
            query.match(new RegExp(escapeRegExp(wrappedSql), 'g'))!.length,
        ).toBeGreaterThanOrEqual(2);
    });

    test('DATE base dimension + flag on + non-UTC TZ short-circuits (bare EXTRACT)', () => {
        const { query } = buildQuery({
            explore: buildExtractExplore(DimensionType.DATE),
            compiledMetricQuery: baseDowQuery(),
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: true,
        });
        expect(query).toContain(`DATE_PART('DOW', "events".occurred_at)`);
        expect(query).not.toContain('AT TIME ZONE');
    });

    test('TIMESTAMP base + flag off → bare EXTRACT', () => {
        const { query } = buildQuery({
            explore: buildExtractExplore(DimensionType.TIMESTAMP),
            compiledMetricQuery: baseDowQuery(),
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: false,
        });
        expect(query).toContain(`DATE_PART('DOW', "events".occurred_at)`);
        expect(query).not.toContain('AT TIME ZONE');
    });

    test('Name variant (DAY_OF_WEEK_NAME) wraps with the project TZ', () => {
        const { query } = buildQuery({
            explore: buildExtractExplore(DimensionType.TIMESTAMP),
            compiledMetricQuery: {
                ...baseDowQuery(),
                dimensions: ['events_occurred_at_day_of_week_name'],
            },
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: true,
        });
        expect(query).toContain(
            `TO_CHAR(("events".occurred_at)::timestamptz AT TIME ZONE 'America/New_York', 'FMDay')`,
        );
    });

    test('WEEK_NUM with non-default startOfWeek composes with the TZ wrap (Postgres)', () => {
        const { query } = buildQuery({
            explore: buildExtractExplore(DimensionType.TIMESTAMP),
            compiledMetricQuery: {
                ...baseDowQuery(),
                dimensions: ['events_occurred_at_week_num'],
            },
            warehouseSqlBuilder: {
                ...warehouseClientMock,
                getStartOfWeek: () => 2 /* Wednesday */,
            },
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: true,
        });
        expect(query).toContain(
            `DATE_PART('WEEK', (("events".occurred_at)::timestamptz AT TIME ZONE 'America/New_York' - interval '2 days'))`,
        );
    });

    test('convert_timezone: false on base dim — SELECT skips the wrap, WHERE keeps it', () => {
        const explore = buildExtractExplore(DimensionType.TIMESTAMP);
        // Mark the base dim opted out of display conversion.
        explore.tables.events.dimensions.occurred_at.skipTimezoneConversion = true;

        const { query } = buildQuery({
            explore,
            compiledMetricQuery: baseDowQuery([1]),
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: 'America/New_York',
            useTimezoneAwareDateTrunc: true,
        });

        const wrapped = `DATE_PART('DOW', ("events".occurred_at)::timestamptz AT TIME ZONE 'America/New_York')`;
        const bare = `DATE_PART('DOW', "events".occurred_at)`;

        // Asymmetry: SELECT renders the bare expression, WHERE keeps the
        // project-tz wrap so the filter still bounds by project-tz days.
        const selectClause = query.slice(0, query.indexOf('WHERE'));
        const whereClause = query.slice(query.indexOf('WHERE'));

        expect(selectClause).toContain(bare);
        expect(selectClause).not.toContain(wrapped);
        expect(whereClause).toContain(wrapped);
    });
});
