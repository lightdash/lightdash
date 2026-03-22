import {
    OTHER_GROUP_DISPLAY_VALUE,
    type EChartsSeries,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import { getDataFromChartClick } from './utils';

const createClickEvent = (seriesIndex: number): EchartsSeriesClickEvent =>
    ({
        componentType: 'series',
        seriesType: 'bar',
        seriesIndex,
        seriesName: OTHER_GROUP_DISPLAY_VALUE,
        name: OTHER_GROUP_DISPLAY_VALUE,
        dataIndex: 0,
        data: {},
        dataType: '',
        value: [1],
        color: '#000000',
        event: { event: new MouseEvent('click') },
        dimensionNames: [],
    }) as EchartsSeriesClickEvent;

describe('getDataFromChartClick', () => {
    it('collects every visible top date value for an Other series', () => {
        const series = [
            {
                pivotReference: {
                    field: 'customers_unique_customer_count',
                    pivotValues: [
                        {
                            field: 'orders_order_date_month',
                            value: '2024-06-01T00:00:00.000Z',
                        },
                    ],
                },
            },
            {
                pivotReference: {
                    field: 'customers_unique_customer_count',
                    pivotValues: [
                        {
                            field: 'orders_order_date_month',
                            value: '2025-01-01T00:00:00.000Z',
                        },
                    ],
                },
            },
            {
                pivotReference: {
                    field: 'customers_unique_customer_count',
                    pivotValues: [
                        {
                            field: 'orders_order_date_month',
                            value: OTHER_GROUP_DISPLAY_VALUE,
                            isOtherGroup: true,
                        },
                    ],
                },
            },
        ] as EChartsSeries[];

        const result = getDataFromChartClick(createClickEvent(2), {}, series);

        expect(result.topGroupTuples).toEqual([
            { orders_order_date_month: '2024-06-01T00:00:00.000Z' },
            { orders_order_date_month: '2025-01-01T00:00:00.000Z' },
        ]);
    });

    it('collects tuples preserving multi-pivot field associations', () => {
        const series = [
            {
                pivotReference: {
                    field: 'customers_unique_customer_count',
                    pivotValues: [
                        { field: 'segment', value: 'enterprise' },
                        { field: 'orders_is_completed', value: true },
                    ],
                },
            },
            {
                pivotReference: {
                    field: 'customers_unique_customer_count',
                    pivotValues: [
                        { field: 'segment', value: 'self_serve' },
                        { field: 'orders_is_completed', value: false },
                    ],
                },
            },
            {
                pivotReference: {
                    field: 'customers_unique_customer_count',
                    pivotValues: [
                        {
                            field: 'segment',
                            value: OTHER_GROUP_DISPLAY_VALUE,
                            isOtherGroup: true,
                        },
                        {
                            field: 'orders_is_completed',
                            value: OTHER_GROUP_DISPLAY_VALUE,
                            isOtherGroup: true,
                        },
                    ],
                },
            },
        ] as EChartsSeries[];

        const result = getDataFromChartClick(createClickEvent(2), {}, series);

        // Tuples preserve field associations — no flattening
        expect(result.topGroupTuples).toEqual([
            { segment: 'enterprise', orders_is_completed: true },
            { segment: 'self_serve', orders_is_completed: false },
        ]);
    });

    it('returns undefined topGroupTuples when no Other series exists', () => {
        const series = [
            {
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [{ field: 'region', value: 'US' }],
                },
            },
            {
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [{ field: 'region', value: 'EU' }],
                },
            },
        ] as EChartsSeries[];

        const result = getDataFromChartClick(createClickEvent(0), {}, series);

        expect(result.topGroupTuples).toBeUndefined();
    });

    it('deduplicates tuples across series for Other drill-through', () => {
        const series = [
            {
                pivotReference: {
                    field: 'metric_a',
                    pivotValues: [{ field: 'region', value: 'US' }],
                },
            },
            {
                pivotReference: {
                    field: 'metric_b',
                    pivotValues: [{ field: 'region', value: 'US' }],
                },
            },
            {
                pivotReference: {
                    field: 'metric_a',
                    pivotValues: [
                        {
                            field: 'region',
                            value: OTHER_GROUP_DISPLAY_VALUE,
                            isOtherGroup: true,
                        },
                    ],
                },
            },
        ] as EChartsSeries[];

        const result = getDataFromChartClick(createClickEvent(2), {}, series);

        // 'US' appears in two series but should be deduplicated into one tuple
        expect(result.topGroupTuples).toEqual([{ region: 'US' }]);
    });

    it('multi-pivot Other filter excludes only exact tuples, not cross-products', () => {
        // Regression test for the tuple semantics bug:
        // With top groups (US, Paid) and (CA, Organic), the filter must exclude
        // exactly those two tuples but NOT (US, Organic) or (CA, Paid).
        const series = [
            {
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [
                        { field: 'country', value: 'US' },
                        { field: 'channel', value: 'Paid' },
                    ],
                },
            },
            {
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [
                        { field: 'country', value: 'CA' },
                        { field: 'channel', value: 'Organic' },
                    ],
                },
            },
            {
                pivotReference: {
                    field: 'revenue',
                    pivotValues: [
                        {
                            field: 'country',
                            value: OTHER_GROUP_DISPLAY_VALUE,
                            isOtherGroup: true,
                        },
                        {
                            field: 'channel',
                            value: OTHER_GROUP_DISPLAY_VALUE,
                            isOtherGroup: true,
                        },
                    ],
                },
            },
        ] as EChartsSeries[];

        const result = getDataFromChartClick(createClickEvent(2), {}, series);

        // Each tuple is a full group, not per-field value lists
        expect(result.topGroupTuples).toEqual([
            { country: 'US', channel: 'Paid' },
            { country: 'CA', channel: 'Organic' },
        ]);

        // Verify tuples are NOT flattened — this was the old (broken) behavior
        expect(result.topGroupTuples).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ country: 'US', channel: 'Organic' }),
            ]),
        );
    });
});
