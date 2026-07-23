import {
    ChartType,
    type ChartConfig,
    type ChartSampleData,
    type MetricQuery,
} from '@lightdash/common';
import { buildChartReference } from './AppGenerateService';

describe('buildChartReference', () => {
    const chartConfig: ChartConfig = { type: ChartType.BIG_NUMBER };
    const chart = {
        name: 'Revenue',
        tableName: 'orders',
        metricQuery: {} as MetricQuery,
        chartConfig,
    };
    it('carries chartUuid and linked=true, no sample, for a linked chart', () => {
        const ref = buildChartReference(chart, 'chart-1', true, null);
        expect(ref.chartUuid).toBe('chart-1');
        expect(ref.linked).toBe(true);
        expect(ref.sampleData).toBeNull();
    });
    it('defaults to a copy (linked=false) and keeps sample data', () => {
        const sample: ChartSampleData = {
            status: 'available',
            rows: [],
            truncated: false,
        };
        const ref = buildChartReference(chart, 'chart-2', false, sample);
        expect(ref.linked).toBe(false);
        expect(ref.sampleData).toBe(sample);
    });

    it('preserves ordered pivot rows', () => {
        const ref = buildChartReference(
            {
                ...chart,
                pivotConfig: {
                    columns: ['orders_status'],
                    rows: ['orders_order_date', 'orders_total_revenue'],
                },
            },
            'chart-3',
            false,
            null,
        );

        expect(ref.pivotConfig).toEqual({
            columns: ['orders_status'],
            rows: ['orders_order_date', 'orders_total_revenue'],
        });
    });
});
