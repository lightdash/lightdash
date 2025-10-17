import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type CustomMetricBase,
    type Explore,
    type TableCalcsSchema,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';

import { validateAxisFields } from './validators';

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
                product_category: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'product_category',
                    label: 'Product Category',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.product_category',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.product_category',
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
                avg_order_value: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.AVERAGE,
                    name: 'avg_order_value',
                    label: 'Average Order Value',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'AVG(${TABLE}.amount)',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'AVG(orders.amount)',
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

describe('validateAxisFields', () => {
    describe('Edge Cases', () => {
        it('should not throw when chartConfig is null or undefined', () => {
            expect(() =>
                validateAxisFields(
                    mockExplore,
                    null,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    undefined,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();
        });

        it('should not throw when xAxisDimension and yAxisMetrics are null', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'table',
                xAxisDimension: null,
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();
        });

        it('should not throw when yAxisMetrics is an empty array', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'table',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: [],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();
        });
    });

    describe('Happy Paths - xAxisDimension', () => {
        it('should not throw for valid xAxisDimension', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });

        it('should not throw when xAxisDimension is one of multiple selected dimensions', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = [
                'orders_order_date',
                'orders_customer_name',
                'orders_product_category',
            ];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Happy Paths - yAxisMetrics', () => {
        it('should not throw for valid yAxisMetrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });

        it('should not throw for multiple valid yAxisMetrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'line',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: [
                    'orders_total_revenue',
                    'orders_order_count',
                    'orders_avg_order_value',
                ],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: 'line',
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
                'orders_avg_order_value',
            ];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });

        it('should not throw when yAxisMetrics includes table calculations', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'line',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue', 'running_total_revenue'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: 'line',
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const tableCalculations: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_revenue',
                    displayName: 'Running Total Revenue',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                    null,
                    tableCalculations,
                ),
            ).not.toThrow();
        });

        it('should not throw when all yAxisMetrics are table calculations', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'line',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['running_total_revenue', 'percent_change'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: 'line',
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const tableCalculations: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_revenue',
                    displayName: 'Running Total Revenue',
                    fieldId: 'orders_total_revenue',
                },
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_total_revenue',
                    orderBy: [],
                },
            ];

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                    null,
                    tableCalculations,
                ),
            ).not.toThrow();
        });
    });

    describe('Combined Happy Paths', () => {
        it('should not throw for valid xAxisDimension and yAxisMetrics together', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue', 'orders_order_count'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'Date',
                yAxisLabel: 'Revenue & Count',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
            ];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Error Cases - xAxisDimension', () => {
        it('should throw when xAxisDimension does not exist in explore', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'non_existent_dimension',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'category',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/xAxisDimension "non_existent_dimension" does not exist/);
        });

        it('should throw when xAxisDimension is a metric not a dimension', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_total_revenue',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'category',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(
                /xAxisDimension "orders_total_revenue".*is not a dimension/,
            );

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Field Type: metric/);

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Expected Type: dimension/);
        });

        it('should throw when xAxisDimension is not in queryConfig.dimensions', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_customer_name',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'category',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(
                /xAxisDimension "orders_customer_name".*is not included in queryConfig.dimensions/,
            );

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Selected Dimensions: orders_order_date/);
        });
    });

    describe('Error Cases - yAxisMetrics', () => {
        it('should throw when yAxisMetric does not exist in explore or table calculations', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: null,
                yAxisMetrics: ['non_existent_metric'],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(
                /yAxisMetric "non_existent_metric" does not exist in the explore or table calculations/,
            );
        });

        it('should throw when yAxisMetric is a dimension not a metric', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: null,
                yAxisMetrics: ['orders_order_date'],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/yAxisMetric "orders_order_date".*is not a metric/);

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Field Type: dimension/);

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Expected Type: metric/);
        });

        it('should throw when yAxisMetric is not in queryConfig.metrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: null,
                yAxisMetrics: ['orders_avg_order_value'],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(
                /yAxisMetric "orders_avg_order_value".*is not included in queryConfig.metrics/,
            );

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Selected Metrics: orders_total_revenue/);
        });

        it('should throw when one of multiple yAxisMetrics is invalid', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'line',
                xAxisDimension: null,
                yAxisMetrics: [
                    'orders_total_revenue',
                    'orders_avg_order_value',
                ],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(
                /yAxisMetric "orders_avg_order_value".*is not included in queryConfig.metrics/,
            );
        });
    });

    describe('Error Cases - Combined', () => {
        it('should throw multiple errors when both xAxisDimension and yAxisMetrics are invalid', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_total_revenue',
                yAxisMetrics: ['orders_order_date'],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Invalid axis field configuration/);

            // Should contain error about xAxisDimension being a metric
            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(
                /xAxisDimension "orders_total_revenue".*is not a dimension/,
            );

            // Should contain error about yAxisMetric being a dimension
            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/yAxisMetric "orders_order_date".*is not a metric/);
        });
    });

    describe('Custom Metrics Integration', () => {
        it('should not throw when yAxisMetrics includes custom metrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue', 'orders_custom_metric'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'custom_metric',
                    label: 'Custom Metric',
                    description: 'Custom calculation',
                    table: 'orders',
                    baseDimensionName: 'order_date',
                    type: MetricType.SUM,
                },
            ];

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_custom_metric',
            ];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                    customMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Error Message Quality', () => {
        it('should provide helpful error message with available dimensions', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'invalid_dimension',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Available dimensions:/);

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_order_date/);
        });

        it('should provide helpful error message with available metrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: null,
                yAxisMetrics: ['invalid_metric'],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: null,
                yAxisLabel: null,
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/Available metrics:/);

            expect(() =>
                validateAxisFields(
                    mockExplore,
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_total_revenue/);
        });
    });
});
