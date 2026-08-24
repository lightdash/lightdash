import { describe, expect, it, vi } from 'vitest';
import {
    buildHostDrillDownAction,
    type HostDrillDownBridge,
} from './apiTransport';

const makeAction = (bridge?: HostDrillDownBridge) =>
    buildHostDrillDownAction({
        bridge,
        queryUuid: 'q-1',
        fields: [
            { name: 'status', fieldId: 'orders_status' },
            { name: 'revenue', fieldId: 'orders_revenue' },
        ],
        requiredDimensions: ['status'],
        resolveMetric: (metric) => `orders_${metric}`,
        validMetricIds: ['orders_revenue'],
        format: (row, field) =>
            field === 'revenue' ? `$${row[field]}` : String(row[field]),
    });

describe('host drill-down action', () => {
    it('qualifies and formats the original SDK row before posting', async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const action = makeAction({ isEnabled: () => true, open });

        expect(action.enabled).toBe(true);
        await action.open({
            row: { status: 'paid', revenue: 42 },
            metric: 'revenue',
        });

        expect(open).toHaveBeenCalledWith({
            queryUuid: 'q-1',
            metric: 'orders_revenue',
            row: {
                orders_status: {
                    value: { raw: 'paid', formatted: 'paid' },
                },
                orders_revenue: {
                    value: { raw: 42, formatted: '$42' },
                },
            },
        });
    });

    it('is disabled without a current host capability', async () => {
        const action = makeAction();
        expect(action.enabled).toBe(false);
        await expect(
            action.open({ row: { status: 'paid' }, metric: 'revenue' }),
        ).rejects.toThrow(/not available/i);
    });

    it('reflects capability changes announced after the query loaded', () => {
        let enabled = false;
        const action = makeAction({
            isEnabled: () => enabled,
            open: vi.fn(),
        });

        expect(action.enabled).toBe(false);
        enabled = true;
        expect(action.enabled).toBe(true);
    });

    it('rejects transformed rows and non-source metrics', async () => {
        const action = makeAction({
            isEnabled: () => true,
            open: vi.fn(),
        });
        await expect(
            action.open({ row: { revenue: 42 }, metric: 'revenue' }),
        ).rejects.toThrow(/missing dimension "status"/i);
        await expect(
            action.open({
                row: { status: 'paid', revenue: 42 },
                metric: 'profit',
            }),
        ).rejects.toThrow(/not a metric in the source query/i);
    });
});
