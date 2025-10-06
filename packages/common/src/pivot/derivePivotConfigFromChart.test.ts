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
import { derivePivotConfigurationFromChart } from './derivePivotConfigFromChart';
import {
    mockCartesianChartConfig,
    mockItems,
    mockMetricQuery,
    mockMetricQueryWithMultipleIndexColumns,
} from './derivePivotConfigFromChart.mock';

// Jest provides describe/it/expect globals

import {
    BinType,
    CustomDimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
    type TableCalculation,
} from '../types/field';
import type { MetricQuery } from '../types/metricQuery';

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
        });
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
});
