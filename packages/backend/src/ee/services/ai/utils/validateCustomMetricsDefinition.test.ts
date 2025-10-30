import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CustomMetricBase,
    type Explore,
} from '@lightdash/common';

import { validateCustomMetricsDefinition } from './validators';

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
                order_date: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    name: 'order_date',
                    label: 'Order Date',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.order_date',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.order_date',
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
                amount: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'amount',
                    label: 'Amount',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.amount',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.amount',
                    tablesReferences: ['orders'],
                },
                is_active: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.BOOLEAN,
                    name: 'is_active',
                    label: 'Is Active',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.is_active',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.is_active',
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

describe('validateCustomMetricsDefinition', () => {
    describe('Edge Cases', () => {
        it('should not throw when customMetrics is null', () => {
            expect(() =>
                validateCustomMetricsDefinition(mockExplore, null),
            ).not.toThrow();
        });

        it('should not throw when customMetrics is an empty array', () => {
            expect(() =>
                validateCustomMetricsDefinition(mockExplore, []),
            ).not.toThrow();
        });
    });

    describe('Happy Paths', () => {
        it('should not throw for valid custom metric with fieldId format', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_amount',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).not.toThrow();
        });

        it('should not throw for valid custom metric with field name format (backward compatibility)', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'amount',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).not.toThrow();
        });

        it('should not throw for valid custom metric with COUNT on STRING dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'unique_customers',
                    label: 'Unique Customers',
                    description: 'Count distinct customer names',
                    type: MetricType.COUNT_DISTINCT,
                    baseDimensionName: 'orders_customer_name',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).not.toThrow();
        });

        it('should not throw for valid custom metric with COUNT on BOOLEAN dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'active_count',
                    label: 'Active Count',
                    description: 'Count active orders',
                    type: MetricType.COUNT,
                    baseDimensionName: 'orders_is_active',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).not.toThrow();
        });

        it('should not throw for valid custom metric with MIN/MAX on DATE dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'earliest_order',
                    label: 'Earliest Order',
                    description: 'Minimum order date',
                    type: MetricType.MIN,
                    baseDimensionName: 'orders_order_date',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).not.toThrow();
        });

        it('should not throw for multiple valid custom metrics', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_amount',
                    table: 'orders',
                },
                {
                    name: 'unique_customers',
                    label: 'Unique Customers',
                    description: 'Count distinct customer names',
                    type: MetricType.COUNT_DISTINCT,
                    baseDimensionName: 'orders_customer_name',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).not.toThrow();
        });
    });

    describe('Error Cases', () => {
        it('should throw when baseDimensionName is missing', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: '',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/base dimension name is required/);
        });

        it('should throw when baseDimensionName (fieldId) does not exist in explore', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_nonexistent',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/does not exist in the explore/);
        });

        it('should throw when baseDimensionName (field name) does not exist in explore', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'nonexistent',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/does not exist in the explore/);
        });

        it('should throw when baseDimensionName is from wrong table', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'payments_amount',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/does not exist in the explore/);
        });

        it('should throw when baseDimensionName points to a metric instead of dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'double_revenue',
                    label: 'Double Revenue',
                    description: 'Double the total revenue',
                    type: MetricType.SUM,
                    baseDimensionName: 'orders_total_revenue',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/is not a dimension/);
        });

        it('should throw when applying AVERAGE to STRING dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_customer',
                    label: 'Average Customer',
                    description: 'Invalid: average on string',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_customer_name',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/cannot apply average aggregation to string dimension/i);
        });

        it('should throw when applying SUM to STRING dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'sum_customer',
                    label: 'Sum Customer',
                    description: 'Invalid: sum on string',
                    type: MetricType.SUM,
                    baseDimensionName: 'orders_customer_name',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/cannot apply sum aggregation to string dimension/i);
        });

        it('should throw when applying PERCENTILE to STRING dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'percentile_customer',
                    label: 'Percentile Customer',
                    description: 'Invalid: percentile on string',
                    type: MetricType.PERCENTILE,
                    baseDimensionName: 'orders_customer_name',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(
                /cannot apply percentile aggregation to string dimension/i,
            );
        });

        it('should throw when applying AVERAGE to BOOLEAN dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_active',
                    label: 'Average Active',
                    description: 'Invalid: average on boolean',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_is_active',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/cannot apply average aggregation to boolean dimension/i);
        });

        it('should throw when applying SUM to BOOLEAN dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'sum_active',
                    label: 'Sum Active',
                    description: 'Invalid: sum on boolean',
                    type: MetricType.SUM,
                    baseDimensionName: 'orders_is_active',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/cannot apply sum aggregation to boolean dimension/i);
        });

        it('should throw when applying AVERAGE to DATE dimension', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_date',
                    label: 'Average Date',
                    description: 'Invalid: average on date',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_order_date',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(/cannot apply average aggregation to date dimension/i);
        });

        it('should throw with multiple error messages when multiple custom metrics are invalid', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_customer',
                    label: 'Average Customer',
                    description: 'Invalid: average on string',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_customer_name',
                    table: 'orders',
                },
                {
                    name: 'nonexistent_metric',
                    label: 'Nonexistent Metric',
                    description: 'Invalid: field does not exist',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_nonexistent',
                    table: 'orders',
                },
            ];

            expect(() =>
                validateCustomMetricsDefinition(mockExplore, customMetrics),
            ).toThrow(
                /average aggregation to string[\s\S]*does not exist in the explore|does not exist in the explore[\s\S]*average aggregation to string/i,
            );
        });
    });
});
