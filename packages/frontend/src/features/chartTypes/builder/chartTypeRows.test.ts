import { describe, expect, it } from 'vitest';
import { getChartTypeRowColumns } from './chartTypeRows';

describe('getChartTypeRowColumns', () => {
    it('keeps result columns visible when a query returns no rows', () => {
        expect(
            getChartTypeRowColumns({
                rows: [],
                pivotDetails: null,
                labels: {
                    orders_status: 'Status',
                    orders_revenue: 'Revenue',
                },
            }),
        ).toEqual([
            { reference: 'orders_status', label: 'Status' },
            { reference: 'orders_revenue', label: 'Revenue' },
        ]);
    });
});
