import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    WindowFunctionType,
    type CustomMetricBase,
    type Explore,
    type TableCalcsSchema,
} from '@lightdash/common';
import { validateTableCalculations } from './validators';

const mockExplore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'test_explore',
    label: 'Test Explore',
    tags: [],
    spotlight: {
        visibility: 'show',
        categories: [],
    },
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'test_db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            dimensions: {
                order_id: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.order_id',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.order_id',
                    tablesReferences: ['orders'],
                },
                customer_name: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'customer_name',
                    label: 'Customer Name',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.customer_name',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.customer_name',
                    tablesReferences: ['orders'],
                },
            },
            metrics: {
                total_revenue: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'total_revenue',
                    label: 'Total Revenue',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'SUM(${TABLE}.amount)',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'SUM(orders.amount)',
                    tablesReferences: ['orders'],
                },
                order_count: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                    name: 'order_count',
                    label: 'Order Count',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'COUNT(*)',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'COUNT(*)',
                    tablesReferences: ['orders'],
                },
                max_date: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.MAX,
                    name: 'max_date',
                    label: 'Max Date',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'MAX(${TABLE}.created_at)',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'MAX(orders.created_at)',
                    tablesReferences: ['orders'],
                },
            },
            lineageGraph: {},
            source: undefined,
            groupLabel: undefined,
        },
    },
    groupLabel: undefined,
    warehouse: undefined,
    sqlPath: undefined,
    ymlPath: undefined,
    databricksCompute: undefined,
};

describe('validateTableCalculations', () => {
    describe('Edge Cases', () => {
        it('should not throw for null or empty tableCalcs array', () => {
            expect(() =>
                validateTableCalculations(mockExplore, null, [], null),
            ).not.toThrow();

            expect(() =>
                validateTableCalculations(mockExplore, [], [], null),
            ).not.toThrow();
        });
    });

    describe('Basic Happy Paths', () => {
        it('should not throw for valid table calculation with selected metric', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_revenue',
                    displayName: 'Running Total Revenue',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should not throw for rank_in_column calculation type', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'rank_in_column',
                    name: 'revenue_rank',
                    displayName: 'Revenue Rank',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });
    });

    describe('Custom Metrics Integration', () => {
        it('should not throw when table calc references custom metric', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_custom',
                    displayName: 'Running Total Custom',
                    fieldId: 'orders_avg_revenue',
                },
            ];

            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_revenue',
                    label: 'Average Revenue',
                    description: 'Average revenue per order',
                    table: 'orders',
                    baseDimensionName: 'order_id',
                    type: MetricType.AVERAGE,
                },
            ];

            const selectedMetrics = ['orders_avg_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    customMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Window Functions', () => {
        it('should not throw for nillary window function without fieldId', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'window_function',
                    name: 'row_num',
                    displayName: 'Row Number',
                    windowFunction: WindowFunctionType.ROW_NUMBER,
                    fieldId: null,
                    orderBy: [
                        { fieldId: 'orders_total_revenue', order: 'desc' },
                    ],
                    partitionBy: null,
                    frame: null,
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should not throw for window function with both partitionBy and orderBy', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'window_function',
                    name: 'sum_by_customer',
                    displayName: 'Sum by Customer',
                    windowFunction: WindowFunctionType.SUM,
                    fieldId: 'orders_total_revenue',
                    orderBy: [{ fieldId: 'orders_order_count', order: 'desc' }],
                    partitionBy: ['orders_customer_name'],
                    frame: null,
                },
            ];

            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
            ];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should throw for unary window function missing fieldId', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'window_function',
                    name: 'sum_window',
                    displayName: 'Sum Window',
                    windowFunction: WindowFunctionType.SUM,
                    fieldId: null,
                    orderBy: null,
                    partitionBy: null,
                    frame: null,
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).toThrow(
                /Window function "sum_window" of type "sum" requires a fieldId/,
            );
        });
    });

    describe('Table Calc Dependencies', () => {
        it('should not throw when table calc references another table calc', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_total_revenue',
                },
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'running_total',
                    orderBy: [],
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should not throw when orderBy references another table calculation', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_total_revenue',
                },
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_order_count',
                    orderBy: [{ fieldId: 'running_total', order: 'asc' }],
                },
            ];

            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
            ];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).not.toThrow();
        });

        it('should throw for circular dependency between table calculations', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'calc_a',
                    displayName: 'Calc A',
                    fieldId: 'calc_b',
                },
                {
                    type: 'running_total',
                    name: 'calc_b',
                    displayName: 'Calc B',
                    fieldId: 'calc_a',
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/Circular dependency detected in table calculations/);
        });
    });

    describe('Field Validation Errors', () => {
        it('should throw when fieldId references unselected field', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedMetrics = ['orders_order_count'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/references unselected field "orders_total_revenue"/);
        });

        it('should throw when fieldId references a dimension instead of metric', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total',
                    displayName: 'Running Total',
                    fieldId: 'orders_order_id',
                },
            ];

            const selectedMetrics = ['orders_order_id'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/references "orders_order_id" which is not a metric/);
        });

        it('should throw when orderBy field does not exist', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_total_revenue',
                    orderBy: [{ fieldId: 'non_existent_field', order: 'asc' }],
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/OrderBy field validation failed/);
        });

        it('should throw when partitionBy field does not exist', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_of_column_total',
                    name: 'percent_of_total',
                    displayName: 'Percent of Total',
                    fieldId: 'orders_total_revenue',
                    partitionBy: ['non_existent_field'],
                },
            ];

            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/neither in the explore nor in the custom metrics/);
        });
    });

    describe('Type Validation Errors', () => {
        it('should throw for non-numeric metric with numeric calculation type', () => {
            const tableCalcs: TableCalcsSchema = [
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_max_date',
                    orderBy: [],
                },
            ];

            const selectedMetrics = ['orders_max_date'];

            expect(() =>
                validateTableCalculations(
                    mockExplore,
                    tableCalcs,
                    selectedMetrics,
                    null,
                ),
            ).toThrow(/requires a numeric metric.*has type "max"/);
        });
    });
});
