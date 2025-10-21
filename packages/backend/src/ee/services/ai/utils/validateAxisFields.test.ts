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
                    null,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();

            expect(() =>
                validateAxisFields(
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
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
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
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
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
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Error Cases - xAxisDimension', () => {
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
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_customer_name/);
        });
    });

    describe('Error Cases - yAxisMetrics', () => {
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
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_avg_order_value/);
        });
    });

    describe('Error Cases - Combined', () => {
        it('should throw when both xAxisDimension and yAxisMetrics are not selected', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_customer_name',
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
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_customer_name/);
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

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_custom_metric',
            ];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });
    });
});
