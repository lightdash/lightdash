/// <reference types="vitest/globals" />
import { DateGranularity, FilterOperator } from '@lightdash/common';
import { getZoomedDimFilter } from './dateZoomFilter';

vi.mock('uuid', () => {
    let i = 0;
    return {
        v4: vi.fn(() => `uuid-${(i += 1)}`),
    };
});

describe('getZoomedDimFilter', () => {
    test('returns null when no date zoom is configured', () => {
        expect(
            getZoomedDimFilter('orders_order_date', '2025-01-06', undefined),
        ).toBeNull();
    });

    test('returns null when the field is not the zoomed x-axis', () => {
        expect(
            getZoomedDimFilter('orders_status', 'pending', {
                granularity: DateGranularity.WEEK,
                xAxisFieldId: 'orders_order_date',
            }),
        ).toBeNull();
    });

    test('returns null for null values so NULL filter can be used', () => {
        expect(
            getZoomedDimFilter('orders_order_date', null, {
                granularity: DateGranularity.WEEK,
                xAxisFieldId: 'orders_order_date',
            }),
        ).toBeNull();
    });

    test('returns null for custom (non-standard) granularities', () => {
        expect(
            getZoomedDimFilter('orders_order_date', '2025-01-06', {
                granularity: 'fiscal-quarter',
                xAxisFieldId: 'orders_order_date',
            }),
        ).toBeNull();
    });

    test('builds a [start, nextStart) range for WEEK zoom', () => {
        const filters = getZoomedDimFilter('orders_order_date', '2025-01-06', {
            granularity: DateGranularity.WEEK,
            xAxisFieldId: 'orders_order_date',
        });
        expect(filters).toHaveLength(2);
        expect(filters?.[0]).toMatchObject({
            target: { fieldId: 'orders_order_date' },
            operator: FilterOperator.GREATER_THAN_OR_EQUAL,
            values: ['2025-01-06T00:00:00Z'],
        });
        expect(filters?.[1]).toMatchObject({
            target: { fieldId: 'orders_order_date' },
            operator: FilterOperator.LESS_THAN,
            values: ['2025-01-13T00:00:00Z'],
        });
    });

    test('builds range for MONTH zoom spanning the full month', () => {
        const filters = getZoomedDimFilter('orders_order_date', '2025-02-01', {
            granularity: DateGranularity.MONTH,
            xAxisFieldId: 'orders_order_date',
        });
        expect(filters?.[0].values).toEqual(['2025-02-01T00:00:00Z']);
        expect(filters?.[1].values).toEqual(['2025-03-01T00:00:00Z']);
    });

    test('builds range for QUARTER zoom spanning three months', () => {
        const filters = getZoomedDimFilter('orders_order_date', '2025-01-01', {
            granularity: DateGranularity.QUARTER,
            xAxisFieldId: 'orders_order_date',
        });
        expect(filters?.[0].values).toEqual(['2025-01-01T00:00:00Z']);
        expect(filters?.[1].values).toEqual(['2025-04-01T00:00:00Z']);
    });

    test('builds range for YEAR zoom spanning the full year', () => {
        const filters = getZoomedDimFilter('orders_order_date', '2025-01-01', {
            granularity: DateGranularity.YEAR,
            xAxisFieldId: 'orders_order_date',
        });
        expect(filters?.[0].values).toEqual(['2025-01-01T00:00:00Z']);
        expect(filters?.[1].values).toEqual(['2026-01-01T00:00:00Z']);
    });

    test('handles ISO timestamp raw values without local-timezone drift', () => {
        const filters = getZoomedDimFilter(
            'orders_order_date',
            '2025-01-06T00:00:00.000Z',
            {
                granularity: DateGranularity.WEEK,
                xAxisFieldId: 'orders_order_date',
            },
        );
        expect(filters?.[0].values).toEqual(['2025-01-06T00:00:00Z']);
        expect(filters?.[1].values).toEqual(['2025-01-13T00:00:00Z']);
    });

    test('returns null for invalid date input', () => {
        expect(
            getZoomedDimFilter('orders_order_date', 'not-a-date', {
                granularity: DateGranularity.WEEK,
                xAxisFieldId: 'orders_order_date',
            }),
        ).toBeNull();
    });
});
