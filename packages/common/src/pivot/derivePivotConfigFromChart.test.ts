import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    MetricType,
    TableCalculationType,
    type ItemsMap,
    type TableCalculation,
} from '../types/field';
import type { MetricQuery } from '../types/metricQuery';
import {
    ChartType,
    type CartesianChartConfig,
    type SavedChartDAO,
} from '../types/savedCharts';
import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '../visualizations/types';
// Jest provides describe/it/expect globals
import { derivePivotConfigurationFromChart } from './derivePivotConfigFromChart';
import {
    mockCartesianChartConfig,
    mockItems,
    mockMetricQuery,
    mockMetricQueryWithMultipleIndexColumns,
} from './derivePivotConfigFromChart.mock';

describe('derivePivotConfigurationFromChart', () => {
    it('derives pivot configuration for Cartesian charts with pivot config', () => {
        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: mockCartesianChartConfig,
            pivotConfig: {
                columns: ['orders_status'],
            },
        };

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mockMetricQuery,
            mockItems,
        );

        expect(result).toEqual({
            indexColumn: [
                {
                    reference: 'payments_payment_method',
                    type: VizIndexType.CATEGORY,
                },
            ],
            valuesColumns: [
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupByColumns: [{ reference: 'orders_status' }],
            sortBy: [
                {
                    reference: 'payments_payment_method',
                    direction: SortByDirection.ASC,
                },
            ],
        });
    });

    it('derives pivot configuration for Cartesian charts with pivot config and multiple index columns', () => {
        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: mockCartesianChartConfig,
            pivotConfig: {
                columns: ['orders_status'],
            },
        };

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mockMetricQueryWithMultipleIndexColumns,
            mockItems,
        );

        expect(result).toEqual({
            indexColumn: [
                {
                    reference: 'payments_payment_method',
                    type: VizIndexType.CATEGORY,
                },
                // added by derivePivotConfigurationFromChart since this is not being pivoted on
                {
                    reference: 'customers_customer_id',
                    type: VizIndexType.CATEGORY,
                },
            ],
            valuesColumns: [
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupByColumns: [{ reference: 'orders_status' }],
            sortBy: [
                {
                    reference: 'payments_payment_method',
                    direction: SortByDirection.ASC,
                },
            ],
        });
    });

    it('returns undefined for Cartesian charts without pivot config', () => {
        const savedChart = {
            chartConfig: mockCartesianChartConfig,
            pivotConfig: undefined,
        } as const;

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mockMetricQuery,
            mockItems,
        );

        expect(result).toBeUndefined();
    });

    it('derives pivot configuration for Table charts with pivot config', () => {
        const tableChartConfig = {
            type: ChartType.TABLE,
            config: {},
        } as const;

        // Pivot on payments_payment_method so orders_status becomes index column
        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: tableChartConfig,
            pivotConfig: {
                columns: ['payments_payment_method'],
            },
        };

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mockMetricQuery,
            mockItems,
        );

        expect(result).toEqual({
            indexColumn: [
                {
                    reference: 'orders_status',
                    type: VizIndexType.CATEGORY,
                },
            ],
            valuesColumns: [
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupByColumns: [{ reference: 'payments_payment_method' }],
            sortBy: [
                {
                    reference: 'payments_payment_method',
                    direction: SortByDirection.ASC,
                },
            ],
            metricsAsRows: undefined,
        });
    });

    it('passes metricsAsRows from Table chart config to pivot configuration', () => {
        const tableChartConfig = {
            type: ChartType.TABLE,
            config: {
                metricsAsRows: true,
            },
        } as const;

        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: tableChartConfig,
            pivotConfig: {
                columns: ['payments_payment_method'],
            },
        };

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mockMetricQuery,
            mockItems,
        );

        expect(result?.metricsAsRows).toBe(true);
    });

    it('does not include metricsAsRows for Cartesian charts', () => {
        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: mockCartesianChartConfig,
            pivotConfig: {
                columns: ['orders_status'],
            },
        };

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mockMetricQuery,
            mockItems,
        );

        // Cartesian charts don't have metricsAsRows, so it should be undefined
        expect(result?.metricsAsRows).toBeUndefined();
    });

    it('returns undefined for unsupported chart types (PIE)', () => {
        const pieChartConfig = {
            type: ChartType.PIE,
            config: {},
        } as const;

        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: pieChartConfig,
            pivotConfig: { columns: ['payments_payment_method'] },
        };

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mockMetricQuery,
            mockItems,
        );

        expect(result).toBeUndefined();
    });

    it('filters out sorts that are not present in pivot configuration', () => {
        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: mockCartesianChartConfig,
            pivotConfig: {
                columns: ['orders_status'],
            },
        };

        const mq = {
            ...mockMetricQuery,
            sorts: [
                { fieldId: 'payments_payment_method', descending: false }, // present as index
                { fieldId: 'payments_total_revenue', descending: true }, // present as value column
                { fieldId: 'non_existing_field', descending: false }, // should be filtered out
            ],
        } as typeof mockMetricQuery;

        const result = derivePivotConfigurationFromChart(
            savedChart,
            mq,
            mockItems,
        );

        expect(result?.sortBy).toEqual([
            {
                reference: 'payments_payment_method',
                direction: SortByDirection.ASC,
            },
            {
                reference: 'payments_total_revenue',
                direction: SortByDirection.DESC,
            },
        ]);
    });

    it('supports custom dimensions (bin) as valid xField and indexColumn in cartesian charts', () => {
        const items: ItemsMap = {
            ...mockItems,
            amount_range: {
                id: 'amount_range',
                name: 'amount range',
                table: 'payments',
                type: CustomDimensionType.BIN,
                dimensionId: 'payments_amount',
                binType: BinType.FIXED_NUMBER,
                binNumber: 5,
            },
        };

        const mq: MetricQuery = {
            ...mockMetricQuery,
            dimensions: ['amount_range', 'payments_payment_method'],
            sorts: [
                {
                    fieldId: 'payments_total_revenue',
                    descending: true,
                },
            ],
        };

        const cartesianWithCustomX: CartesianChartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'amount_range',
                    yField: ['payments_total_revenue'],
                },
                eChartsConfig: { series: [] },
            },
        };

        const savedChart: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'> = {
            chartConfig: cartesianWithCustomX,
            pivotConfig: { columns: ['payments_payment_method'] },
        };

        const result = derivePivotConfigurationFromChart(savedChart, mq, items);

        expect(result).toEqual({
            indexColumn: [
                {
                    reference: 'amount_range',
                    type: VizIndexType.CATEGORY,
                },
            ],
            valuesColumns: [
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupByColumns: [{ reference: 'payments_payment_method' }],
            sortBy: [
                {
                    reference: 'payments_total_revenue',
                    direction: SortByDirection.DESC,
                },
            ],
        });
    });

    describe('Table Calculations Support', () => {
        const mockTableCalculation: TableCalculation = {
            name: 'revenue_per_order',
            displayName: 'Revenue per Order',
            sql: '${payments_total_revenue} / ${orders_count}',
        };

        const mockTableCalculation2: TableCalculation = {
            name: 'revenue_growth',
            displayName: 'Revenue Growth',
            sql: '(${payments_total_revenue} - LAG(${payments_total_revenue})) / LAG(${payments_total_revenue})',
        };

        it('includes table calculations in valuesColumns for Table charts', () => {
            const tableChartConfig = {
                type: ChartType.TABLE,
                config: {},
            } as const;

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: tableChartConfig,
                pivotConfig: {
                    columns: ['payments_payment_method'],
                },
            };

            const metricQueryWithTC: MetricQuery = {
                ...mockMetricQuery,
                tableCalculations: [
                    mockTableCalculation,
                    mockTableCalculation2,
                ],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryWithTC,
                mockItems,
            );

            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
                {
                    reference: 'revenue_per_order',
                    aggregation: VizAggregationOptions.ANY,
                },
                {
                    reference: 'revenue_growth',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
        });

        it('includes table calculations in valuesColumns for Cartesian charts when in yField', () => {
            const cartesianChartWithTC: CartesianChartConfig = {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'payments_payment_method',
                        yField: ['payments_total_revenue', 'revenue_per_order'],
                    },
                    eChartsConfig: { series: [] },
                },
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: cartesianChartWithTC,
                pivotConfig: { columns: ['orders_status'] },
            };

            const metricQueryWithTC: MetricQuery = {
                ...mockMetricQuery,
                tableCalculations: [mockTableCalculation],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryWithTC,
                mockItems,
            );

            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
                {
                    reference: 'revenue_per_order',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
        });

        it('filters out table calculations not in yField for Cartesian charts', () => {
            const cartesianChartWithTC: CartesianChartConfig = {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'payments_payment_method',
                        yField: ['payments_total_revenue'], // Only metric, not the table calc
                    },
                    eChartsConfig: { series: [] },
                },
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: cartesianChartWithTC,
                pivotConfig: { columns: ['orders_status'] },
            };

            const metricQueryWithTC: MetricQuery = {
                ...mockMetricQuery,
                tableCalculations: [mockTableCalculation], // TC exists but not in yField
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryWithTC,
                mockItems,
            );

            // Should only include the metric that's actually in yField
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            expect(result?.indexColumn).toEqual([
                {
                    reference: 'payments_payment_method',
                    type: VizIndexType.CATEGORY,
                },
            ]);
        });

        it('handles mixed metrics and table calculations in Table charts', () => {
            const tableChartConfig = {
                type: ChartType.TABLE,
                config: {},
            } as const;

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: tableChartConfig,
                pivotConfig: {
                    columns: ['orders_status'],
                },
            };

            // Add another metric to mockItems
            const itemsWithMoreMetrics: ItemsMap = {
                ...mockItems,
                orders_count: {
                    sql: 'COUNT(${TABLE}.order_id)',
                    name: 'count',
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Order Count',
                    hidden: false,
                    index: 0,
                    filters: [],
                    groups: [],
                },
            };

            const metricQueryWithMixed: MetricQuery = {
                ...mockMetricQuery,
                metrics: ['payments_total_revenue', 'orders_count'],
                tableCalculations: [mockTableCalculation],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryWithMixed,
                itemsWithMoreMetrics,
            );

            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
                {
                    reference: 'orders_count',
                    aggregation: VizAggregationOptions.ANY,
                },
                {
                    reference: 'revenue_per_order',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
        });

        it('handles empty table calculations array', () => {
            const tableChartConfig = {
                type: ChartType.TABLE,
                config: {},
            } as const;

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: tableChartConfig,
                pivotConfig: {
                    columns: ['payments_payment_method'],
                },
            };

            const metricQueryWithEmptyTC: MetricQuery = {
                ...mockMetricQuery,
                tableCalculations: [],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryWithEmptyTC,
                mockItems,
            );

            // Should only have the metric
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
        });

        it('handles undefined table calculations', () => {
            const tableChartConfig = {
                type: ChartType.TABLE,
                config: {},
            } as const;

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: tableChartConfig,
                pivotConfig: {
                    columns: ['payments_payment_method'],
                },
            };

            const metricQueryNoTC: MetricQuery = {
                ...mockMetricQuery,
                // tableCalculations field is optional, so it can be undefined
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryNoTC,
                mockItems,
            );

            // Should only have the metric
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
        });
    });

    describe('Sort by metric not in viz (PROD-6906)', () => {
        it('puts sort-only metrics in sortOnlyColumns for Cartesian charts', () => {
            const itemsWithExtraMetric: ItemsMap = {
                ...mockItems,
                orders_count: {
                    sql: 'COUNT(${TABLE}.order_id)',
                    name: 'count',
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Order Count',
                    hidden: false,
                    index: 0,
                    filters: [],
                    groups: [],
                },
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: mockCartesianChartConfig, // yField: ['payments_total_revenue']
                pivotConfig: { columns: ['orders_status'] },
            };

            const mq: MetricQuery = {
                ...mockMetricQuery,
                metrics: ['payments_total_revenue', 'orders_count'],
                sorts: [
                    { fieldId: 'orders_count', descending: true }, // sort by metric NOT in yField
                ],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                mq,
                itemsWithExtraMetric,
            );

            expect(result).toBeDefined();
            // orders_count should NOT be in valuesColumns
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            // orders_count should be in sortOnlyColumns
            expect(result?.sortOnlyColumns).toEqual([
                {
                    reference: 'orders_count',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            // The sort should be preserved
            expect(result?.sortBy).toEqual([
                {
                    reference: 'orders_count',
                    direction: SortByDirection.DESC,
                },
            ]);
        });

        it('puts sort-only table calculation in sortOnlyColumns', () => {
            const mockTableCalc: TableCalculation = {
                name: 'revenue_per_order',
                displayName: 'Revenue per Order',
                sql: '${payments_total_revenue} / ${orders_count}',
            };

            const cartesianChartWithOneMetric: CartesianChartConfig = {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'payments_payment_method',
                        yField: ['payments_total_revenue'], // TC not in yField
                    },
                    eChartsConfig: { series: [] },
                },
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: cartesianChartWithOneMetric,
                pivotConfig: { columns: ['orders_status'] },
            };

            const mq: MetricQuery = {
                ...mockMetricQuery,
                tableCalculations: [mockTableCalc],
                sorts: [{ fieldId: 'revenue_per_order', descending: true }],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                mq,
                mockItems,
            );

            expect(result).toBeDefined();
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            expect(result?.sortOnlyColumns).toEqual([
                {
                    reference: 'revenue_per_order',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            expect(result?.sortBy).toEqual([
                {
                    reference: 'revenue_per_order',
                    direction: SortByDirection.DESC,
                },
            ]);
        });

        it('sort-only metric does not appear as index column', () => {
            const itemsWithExtraMetric: ItemsMap = {
                ...mockItems,
                orders_count: {
                    sql: 'COUNT(${TABLE}.order_id)',
                    name: 'count',
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Order Count',
                    hidden: false,
                    index: 0,
                    filters: [],
                    groups: [],
                },
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: mockCartesianChartConfig,
                pivotConfig: { columns: ['orders_status'] },
            };

            const mq: MetricQuery = {
                ...mockMetricQuery,
                metrics: ['payments_total_revenue', 'orders_count'],
                sorts: [{ fieldId: 'orders_count', descending: true }],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                mq,
                itemsWithExtraMetric,
            );

            expect(result).toBeDefined();
            // orders_count should be in valuesColumns, NOT indexColumn
            expect(result?.indexColumn).toEqual([
                {
                    reference: 'payments_payment_method',
                    type: VizIndexType.CATEGORY,
                },
            ]);
        });

        it('sort by dimension does not add it to valuesColumns', () => {
            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: mockCartesianChartConfig,
                pivotConfig: { columns: ['orders_status'] },
            };

            const mq: MetricQuery = {
                ...mockMetricQuery,
                sorts: [
                    { fieldId: 'orders_status', descending: false }, // sort by dimension (groupBy)
                ],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                mq,
                mockItems,
            );

            expect(result).toBeDefined();
            // Dimension should NOT appear in valuesColumns
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            // But the sort should still be preserved (it's a groupBy column)
            expect(result?.sortBy).toEqual([
                {
                    reference: 'orders_status',
                    direction: SortByDirection.ASC,
                },
            ]);
        });

        it('does not duplicate metrics already in yField when also in sorts', () => {
            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: mockCartesianChartConfig, // yField: ['payments_total_revenue']
                pivotConfig: { columns: ['orders_status'] },
            };

            const mq: MetricQuery = {
                ...mockMetricQuery,
                sorts: [
                    { fieldId: 'payments_total_revenue', descending: true },
                ],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                mq,
                mockItems,
            );

            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
        });
    });

    describe('Stacked Bar Chart with Table Calculations', () => {
        it('does not include metrics as index columns when table calculation is on y-axis', () => {
            // This tests that metrics used by table calculations but not on the x-axis
            // are not incorrectly added as index columns, which would break stacking
            const itemsWithTableCalc: ItemsMap = {
                ...mockItems,
                orders_shipping_method: {
                    sql: '${TABLE}.shipping_method',
                    name: 'shipping_method',
                    type: DimensionType.STRING,
                    fieldType: FieldType.DIMENSION,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Shipping method',
                    hidden: false,
                    index: 0,
                    groups: [],
                },
                orders_order_source: {
                    sql: '${TABLE}.order_source',
                    name: 'order_source',
                    type: DimensionType.STRING,
                    fieldType: FieldType.DIMENSION,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Order source',
                    hidden: false,
                    index: 1,
                    groups: [],
                },
                orders_total_order_amount: {
                    sql: 'SUM(${TABLE}.amount)',
                    name: 'total_order_amount',
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Total order amount',
                    hidden: false,
                    index: 0,
                    filters: [],
                    groups: [],
                },
                _or_total: {
                    index: 0,
                    name: '_or_total',
                    displayName: '% or total',
                    sql: '${orders.total_order_amount} / sum(${orders.total_order_amount}) over(partition by ${orders.order_source})',
                },
            };

            const stackedBarChartConfig: CartesianChartConfig = {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_shipping_method', // dimension on x-axis
                        yField: ['_or_total'], // table calculation on y-axis (uses the metric)
                    },
                    eChartsConfig: { series: [] },
                },
            };

            const metricQueryForStackedBar: MetricQuery = {
                exploreName: 'orders',
                dimensions: ['orders_shipping_method', 'orders_order_source'],
                metrics: ['orders_total_order_amount'], // metric used by table calc
                filters: {},
                sorts: [
                    { fieldId: 'orders_shipping_method', descending: false },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: '_or_total',
                        displayName: '% or total',
                        sql: '${orders.total_order_amount} / sum(${orders.total_order_amount}) over(partition by ${orders.order_source})',
                    },
                ],
                additionalMetrics: [],
                metricOverrides: {},
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: stackedBarChartConfig,
                pivotConfig: { columns: ['orders_order_source'] }, // pivot on order_source
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryForStackedBar,
                itemsWithTableCalc,
            );

            expect(result).toBeDefined();
            // The metric (orders_total_order_amount) should NOT be in index columns
            // Only the x-axis dimension should be an index column
            expect(result?.indexColumn).toEqual([
                {
                    reference: 'orders_shipping_method',
                    type: VizIndexType.CATEGORY,
                },
            ]);
            // The table calculation should be the value column
            expect(result?.valuesColumns).toEqual([
                {
                    reference: '_or_total',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            // The pivot dimension should be the groupBy column
            expect(result?.groupByColumns).toEqual([
                { reference: 'orders_order_source' },
            ]);
        });
    });

    describe('Scatter Chart with Metrics on Both Axes', () => {
        it('includes x-axis metric as index column for grouped scatter charts', () => {
            // This tests the fix for GitHub issue #19911
            // Scatter charts can have metrics on both x and y axes
            const itemsWithTwoMetrics: ItemsMap = {
                ...mockItems,
                orders_count: {
                    sql: 'COUNT(${TABLE}.order_id)',
                    name: 'count',
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Order Count',
                    hidden: false,
                    index: 0,
                    filters: [],
                    groups: [],
                },
            };

            const scatterChartConfig: CartesianChartConfig = {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_count', // metric on x-axis
                        yField: ['payments_total_revenue'], // metric on y-axis
                    },
                    eChartsConfig: { series: [] },
                },
            };

            const metricQueryForScatter: MetricQuery = {
                exploreName: 'payments',
                dimensions: ['payments_payment_method'], // used as groupBy
                metrics: ['orders_count', 'payments_total_revenue'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                metricOverrides: {},
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: scatterChartConfig,
                pivotConfig: { columns: ['payments_payment_method'] }, // groupBy dimension
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQueryForScatter,
                itemsWithTwoMetrics,
            );

            // The x-axis metric (orders_count) should be included as an index column
            expect(result).toBeDefined();
            expect(result?.indexColumn).toEqual([
                {
                    reference: 'orders_count',
                    type: VizIndexType.CATEGORY,
                },
            ]);
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'payments_total_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
            expect(result?.groupByColumns).toEqual([
                { reference: 'payments_payment_method' },
            ]);
        });
    });

    describe('Regressions for resolved pivot bugs', () => {
        it('preserves metricQuery.metrics order in valuesColumns for table charts with metricsAsRows + multiple dimensions (#19838)', () => {
            // https://github.com/lightdash/lightdash/issues/19838
            // Repro: select metrics in a specific order (Profit → Revenue → Sales),
            // pivot a table chart by a date dimension, enable "metrics as rows".
            // Bug: the metric rows came out in a different order from the user's
            // selection — there was no UI affordance to fix it.
            // Expectation: valuesColumns reflects metricQuery.metrics order
            // verbatim, not alphabetical or some other implicit ordering.
            const itemsWithThreeMetrics: ItemsMap = {
                orders_order_date_day: {
                    sql: '${TABLE}.order_date_day',
                    name: 'order_date_day',
                    type: DimensionType.DATE,
                    index: 1,
                    label: 'Order date day',
                    table: 'orders',
                    groups: [],
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    tableLabel: 'Orders',
                },
                orders_status: {
                    sql: '${TABLE}.status',
                    name: 'status',
                    type: DimensionType.STRING,
                    index: 2,
                    label: 'Status',
                    table: 'orders',
                    groups: [],
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    tableLabel: 'Orders',
                },
                // Metric names are intentionally NOT in alphabetical order so a
                // regression that re-sorts them (alphabetical, by label, by SUM
                // before AVG, etc.) shows up clearly.
                orders_zzz_profit: {
                    sql: '${TABLE}.profit',
                    name: 'zzz_profit',
                    type: MetricType.SUM,
                    index: 1,
                    label: 'Profit',
                    table: 'orders',
                    groups: [],
                    hidden: false,
                    filters: [],
                    fieldType: FieldType.METRIC,
                    tableLabel: 'Orders',
                },
                orders_aaa_revenue: {
                    sql: '${TABLE}.revenue',
                    name: 'aaa_revenue',
                    type: MetricType.SUM,
                    index: 2,
                    label: 'Revenue',
                    table: 'orders',
                    groups: [],
                    hidden: false,
                    filters: [],
                    fieldType: FieldType.METRIC,
                    tableLabel: 'Orders',
                },
                orders_mmm_sales_count: {
                    sql: '${TABLE}.sales_count',
                    name: 'mmm_sales_count',
                    type: MetricType.COUNT,
                    index: 3,
                    label: 'Sales count',
                    table: 'orders',
                    groups: [],
                    hidden: false,
                    filters: [],
                    fieldType: FieldType.METRIC,
                    tableLabel: 'Orders',
                },
            };

            const metricQuery: MetricQuery = {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day', 'orders_status'],
                // Selection order: Profit, Revenue, Sales count.
                metrics: [
                    'orders_zzz_profit',
                    'orders_aaa_revenue',
                    'orders_mmm_sales_count',
                ],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                metricOverrides: {},
            };

            const tableChartConfig = {
                type: ChartType.TABLE,
                config: {
                    metricsAsRows: true,
                },
            } as const;

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: tableChartConfig,
                pivotConfig: { columns: ['orders_order_date_day'] },
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                metricQuery,
                itemsWithThreeMetrics,
            );

            // metricsAsRows must round-trip onto the pivot configuration.
            expect(result?.metricsAsRows).toBe(true);

            // valuesColumns order is the contract: it must match the order in
            // metricQuery.metrics. If a future change re-sorts metrics by
            // label, by name, or by aggregation type, this test will fail.
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'orders_zzz_profit',
                    aggregation: VizAggregationOptions.ANY,
                },
                {
                    reference: 'orders_aaa_revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
                {
                    reference: 'orders_mmm_sales_count',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);
        });

        it('a sort-only table calculation that is not the xField stays out of indexColumn and valuesColumns', () => {
            // Locks the invariant that a TC referenced ONLY by a sort entry
            // (not on any chart axis) is routed exclusively to
            // sortOnlyColumns. The two pathways that could re-break this:
            //
            // 1. getIndexColumn re-introducing a `sortFieldIds.has(tc.name)`
            //    branch — that would make the TC enter indexColumn alongside
            //    its sortOnlyColumns entry, so the chart grows a phantom
            //    series for the sort field.
            // 2. The sortOnlyColumns filter dropping the indexColumn-aware
            //    exclusion — that would let an xField TC double up as both
            //    indexColumn and sortOnlyColumns when sorted by itself.
            //
            // The fixture: cartesian chart, x = a non-pivot dim, y = a
            // metric, plus a TC `y_day` used only for sort.
            const sortOnlyTc: TableCalculation = {
                name: 'y_day',
                displayName: 'Day of year',
                type: TableCalculationType.NUMBER,
                sql: 'EXTRACT(DOY FROM ${orders.order_date_day})',
            };

            const itemsForRepro: ItemsMap = {
                ...mockItems,
                orders_unique_order_count: {
                    sql: 'COUNT(DISTINCT ${TABLE}.order_id)',
                    name: 'unique_order_count',
                    type: MetricType.COUNT_DISTINCT,
                    fieldType: FieldType.METRIC,
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Unique order count',
                    hidden: false,
                    index: 0,
                    filters: [],
                    groups: [],
                },
            };

            const cartesianChartConfig: CartesianChartConfig = {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        // x-axis: a non-pivot dim. The y-axis carries ONLY the
                        // metric — the TC is not on the chart.
                        xField: 'payments_payment_method',
                        yField: ['orders_unique_order_count'],
                    },
                    eChartsConfig: { series: [] },
                },
            };

            const savedChart: Pick<
                SavedChartDAO,
                'chartConfig' | 'pivotConfig'
            > = {
                chartConfig: cartesianChartConfig,
                pivotConfig: { columns: ['orders_status'] },
            };

            const mq: MetricQuery = {
                ...mockMetricQuery,
                metrics: ['orders_unique_order_count'],
                tableCalculations: [sortOnlyTc],
                // The TC drives sort order but is not visualized.
                sorts: [{ fieldId: 'y_day', descending: false }],
            };

            const result = derivePivotConfigurationFromChart(
                savedChart,
                mq,
                itemsForRepro,
            );

            expect(result).toBeDefined();

            // valuesColumns must contain exactly the y-axis metric. Anything
            // else (the TC creeping back in, an additional metric, etc.)
            // would make the rendered chart double its series count.
            expect(result?.valuesColumns).toHaveLength(1);
            expect(result?.valuesColumns).toEqual([
                {
                    reference: 'orders_unique_order_count',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);

            // The TC is preserved as a sort-only column so PivotQueryBuilder
            // can still emit anchor CTEs that order rows by it.
            expect(result?.sortOnlyColumns).toEqual([
                {
                    reference: 'y_day',
                    aggregation: VizAggregationOptions.ANY,
                },
            ]);

            // sortBy still references the TC — the chart-render layer relies
            // on the value columns / sortOnlyColumns split, not on dropping
            // the sort entry.
            expect(result?.sortBy).toEqual([
                { reference: 'y_day', direction: SortByDirection.ASC },
            ]);

            // Hard guarantee: y_day must not appear as an index column
            // either. If it did, the chart would render it on the x-axis or
            // along a series dimension.
            const indexRefs = Array.isArray(result?.indexColumn)
                ? result!.indexColumn.map((c) => c.reference)
                : [result?.indexColumn?.reference];
            expect(indexRefs).not.toContain('y_day');
        });
    });
});
