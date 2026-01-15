import { describe, expect, it } from 'vitest';
import { buildMetricQuery } from '../buildMetricQuery';

describe('buildMetricQuery', () => {
    it('builds metrics/dimensions/filters/sorts with fixed limit', () => {
        const result = buildMetricQuery({
            metrics: ['orders.total_revenue'],
            dimensions: ['orders.status'],
            filters: [
                {
                    id: 'f1',
                    target: { fieldId: 'orders.status' },
                    operator: 'equals',
                    values: ['completed'],
                },
            ],
            sorts: [{ fieldId: 'orders.total_revenue', descending: true }],
            limit: 10000,
        });

        expect(result.metrics).toEqual(['orders.total_revenue']);
        expect(result.dimensions).toEqual(['orders.status']);
        expect(result.filters?.dimensions?.or?.length).toBe(1);
        expect(result.sorts?.[0].fieldId).toBe('orders.total_revenue');
        expect(result.limit).toBe(10000);
    });
});
