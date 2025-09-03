import { ChartType, type SavedChartDAO } from '../types/savedCharts';
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
} from './derivePivotConfigFromChart.mock';

// Jest provides describe/it/expect globals

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
            indexColumn: {
                reference: 'payments_payment_method',
                type: VizIndexType.CATEGORY,
            },
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
});
