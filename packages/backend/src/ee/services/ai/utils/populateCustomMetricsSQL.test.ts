import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type AdditionalMetric,
    type CustomMetricBase,
    type Explore,
} from '@lightdash/common';

import {
    populateCustomMetricSQL,
    populateCustomMetricsSQL,
} from './populateCustomMetricsSQL';

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

describe('populateCustomMetricSQL', () => {
    describe('Edge Cases', () => {
        it('should return null when baseDimensionName is missing', () => {
            const metric: CustomMetricBase = {
                name: 'avg_amount',
                label: 'Average Amount',
                description: 'Average order amount',
                type: MetricType.AVERAGE,
                baseDimensionName: undefined as unknown as string,
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);
            expect(result).toBeNull();
        });

        it('should return null when baseDimensionName is empty string', () => {
            const metric: CustomMetricBase = {
                name: 'avg_amount',
                label: 'Average Amount',
                description: 'Average order amount',
                type: MetricType.AVERAGE,
                baseDimensionName: '',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);
            expect(result).toBeNull();
        });

        it('should return null when field does not exist', () => {
            const metric: CustomMetricBase = {
                name: 'avg_nonexistent',
                label: 'Average Nonexistent',
                description: 'Average nonexistent field',
                type: MetricType.AVERAGE,
                baseDimensionName: 'orders_nonexistent',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);
            expect(result).toBeNull();
        });
    });

    describe('Happy Paths - fieldId format', () => {
        it('should populate SQL for valid custom metric with fieldId format', () => {
            const metric: CustomMetricBase = {
                name: 'avg_amount',
                label: 'Average Amount',
                description: 'Average order amount',
                type: MetricType.AVERAGE,
                baseDimensionName: 'orders_amount',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);

            expect(result).not.toBeNull();
            expect(result?.sql).toBe('${TABLE}.amount');
            expect(result?.baseDimensionName).toBe('amount'); // Converted from fieldId to field name
            expect(result?.name).toBe('avg_amount');
            expect(result?.type).toBe(MetricType.AVERAGE);
            expect(result?.table).toBe('orders');
        });

        it('should populate SQL for valid custom metric with fieldId format for DATE dimension', () => {
            const metric: CustomMetricBase = {
                name: 'min_date',
                label: 'Min Date',
                description: 'Minimum order date',
                type: MetricType.MIN,
                baseDimensionName: 'orders_order_date',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);

            expect(result).not.toBeNull();
            expect(result?.sql).toBe('${TABLE}.order_date');
            expect(result?.baseDimensionName).toBe('order_date');
            expect(result?.name).toBe('min_date');
            expect(result?.type).toBe(MetricType.MIN);
        });

        it('should populate SQL for valid custom metric with fieldId format for STRING dimension', () => {
            const metric: CustomMetricBase = {
                name: 'unique_customers',
                label: 'Unique Customers',
                description: 'Count distinct customer names',
                type: MetricType.COUNT_DISTINCT,
                baseDimensionName: 'orders_customer_name',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);

            expect(result).not.toBeNull();
            expect(result?.sql).toBe('${TABLE}.customer_name');
            expect(result?.baseDimensionName).toBe('customer_name');
            expect(result?.name).toBe('unique_customers');
            expect(result?.type).toBe(MetricType.COUNT_DISTINCT);
        });
    });

    describe('Happy Paths - field name format (backward compatibility)', () => {
        it('should populate SQL for valid custom metric with field name format', () => {
            const metric: CustomMetricBase = {
                name: 'avg_amount',
                label: 'Average Amount',
                description: 'Average order amount',
                type: MetricType.AVERAGE,
                baseDimensionName: 'amount',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);

            expect(result).not.toBeNull();
            expect(result?.sql).toBe('${TABLE}.amount');
            expect(result?.baseDimensionName).toBe('amount'); // Already a field name, unchanged
            expect(result?.name).toBe('avg_amount');
            expect(result?.type).toBe(MetricType.AVERAGE);
        });

        it('should populate SQL for valid custom metric with field name format for DATE dimension', () => {
            const metric: CustomMetricBase = {
                name: 'min_date',
                label: 'Min Date',
                description: 'Minimum order date',
                type: MetricType.MIN,
                baseDimensionName: 'order_date',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);

            expect(result).not.toBeNull();
            expect(result?.sql).toBe('${TABLE}.order_date');
            expect(result?.baseDimensionName).toBe('order_date');
            expect(result?.name).toBe('min_date');
        });
    });

    describe('Happy Paths - AdditionalMetric input', () => {
        it('should populate SQL for AdditionalMetric without sql field', () => {
            const metric: Omit<AdditionalMetric, 'sql'> = {
                name: 'avg_amount',
                label: 'Average Amount',
                description: 'Average order amount',
                type: MetricType.AVERAGE,
                baseDimensionName: 'orders_amount',
                table: 'orders',
            };

            const result = populateCustomMetricSQL(metric, mockExplore);

            expect(result).not.toBeNull();
            expect(result?.sql).toBe('${TABLE}.amount');
            expect(result?.baseDimensionName).toBe('amount');
        });

        it('should preserve other AdditionalMetric fields', () => {
            const metric: Omit<AdditionalMetric, 'sql'> = {
                name: 'avg_amount',
                label: 'Average Amount',
                description: 'Average order amount',
                type: MetricType.AVERAGE,
                baseDimensionName: 'orders_amount',
                table: 'orders',
                hidden: true,
                round: 2,
            };

            const result = populateCustomMetricSQL(metric, mockExplore);

            expect(result).not.toBeNull();
            expect(result?.hidden).toBe(true);
            expect(result?.round).toBe(2);
            expect(result?.sql).toBe('${TABLE}.amount');
        });
    });
});

describe('populateCustomMetricsSQL', () => {
    describe('Edge Cases', () => {
        it('should return empty array when customMetrics is null', () => {
            const result = populateCustomMetricsSQL(null, mockExplore);
            expect(result).toEqual([]);
        });

        it('should return empty array when customMetrics is undefined', () => {
            const result = populateCustomMetricsSQL(undefined, mockExplore);
            expect(result).toEqual([]);
        });

        it('should return empty array when customMetrics is empty array', () => {
            const result = populateCustomMetricsSQL([], mockExplore);
            expect(result).toEqual([]);
        });

        it('should filter out metrics that cannot be populated', () => {
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
                    name: 'avg_nonexistent',
                    label: 'Average Nonexistent',
                    description: 'Average nonexistent field',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_nonexistent',
                    table: 'orders',
                },
            ];

            const result = populateCustomMetricsSQL(customMetrics, mockExplore);

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe('avg_amount');
            expect(result[0]?.sql).toBe('${TABLE}.amount');
        });
    });

    describe('Happy Paths', () => {
        it('should populate SQL for multiple valid custom metrics', () => {
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
                    name: 'min_date',
                    label: 'Min Date',
                    description: 'Minimum order date',
                    type: MetricType.MIN,
                    baseDimensionName: 'orders_order_date',
                    table: 'orders',
                },
            ];

            const result = populateCustomMetricsSQL(customMetrics, mockExplore);

            expect(result).toHaveLength(2);
            expect(result[0]?.name).toBe('avg_amount');
            expect(result[0]?.sql).toBe('${TABLE}.amount');
            expect(result[0]?.baseDimensionName).toBe('amount');
            expect(result[1]?.name).toBe('min_date');
            expect(result[1]?.sql).toBe('${TABLE}.order_date');
            expect(result[1]?.baseDimensionName).toBe('order_date');
        });

        it('should handle mix of fieldId and field name formats', () => {
            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_amount', // fieldId format
                    table: 'orders',
                },
                {
                    name: 'min_date',
                    label: 'Min Date',
                    description: 'Minimum order date',
                    type: MetricType.MIN,
                    baseDimensionName: 'order_date', // field name format
                    table: 'orders',
                },
            ];

            const result = populateCustomMetricsSQL(customMetrics, mockExplore);

            expect(result).toHaveLength(2);
            expect(result[0]?.baseDimensionName).toBe('amount');
            expect(result[1]?.baseDimensionName).toBe('order_date');
        });

        it('should handle AdditionalMetric inputs', () => {
            const customMetrics: Omit<AdditionalMetric, 'sql'>[] = [
                {
                    name: 'avg_amount',
                    label: 'Average Amount',
                    description: 'Average order amount',
                    type: MetricType.AVERAGE,
                    baseDimensionName: 'orders_amount',
                    table: 'orders',
                    hidden: true,
                },
            ];

            const result = populateCustomMetricsSQL(customMetrics, mockExplore);

            expect(result).toHaveLength(1);
            expect(result[0]?.sql).toBe('${TABLE}.amount');
            expect(result[0]?.hidden).toBe(true);
        });
    });
});
