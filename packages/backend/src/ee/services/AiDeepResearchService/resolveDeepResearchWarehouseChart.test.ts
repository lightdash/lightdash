import { describe, expect, it } from 'vitest';
import { resolveDeepResearchWarehouseChart } from './resolveDeepResearchWarehouseChart';

const QUERY_UUID = '11111111-1111-4111-8111-111111111111';

const groupedChartToolArgs = {
    title: 'Revenue by month and status',
    description: 'Monthly revenue split by order status.',
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_order_month', 'orders_status'],
        metrics: ['orders_total_revenue'],
        sorts: [],
        limit: 500,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
    chartConfig: {
        defaultVizType: 'line' as const,
        xAxisDimension: 'orders_order_month',
        yAxisMetrics: ['orders_total_revenue'],
        groupBy: ['orders_status'],
        xAxisType: 'time' as const,
        stackBars: false,
        lineType: 'line' as const,
        funnelDataInput: null,
        xAxisLabel: 'Month',
        yAxisLabel: 'Revenue',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

describe('resolveDeepResearchWarehouseChart', () => {
    it('preserves a supported grouped visualization', () => {
        const resolved = resolveDeepResearchWarehouseChart(
            groupedChartToolArgs,
            QUERY_UUID,
        );

        expect(resolved?.chart.chartConfig).toMatchObject({
            defaultVizType: 'line',
            groupBy: ['orders_status'],
            stackBars: false,
        });
    });

    it('returns null when the execution has no chart config', () => {
        expect(
            resolveDeepResearchWarehouseChart(
                { ...groupedChartToolArgs, chartConfig: null },
                QUERY_UUID,
            ),
        ).toBeNull();
    });
});
