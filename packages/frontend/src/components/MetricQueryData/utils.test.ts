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

        expect(result.topGroupValues).toEqual({
            orders_order_date_month: [
                '2024-06-01T00:00:00.000Z',
                '2025-01-01T00:00:00.000Z',
            ],
        });
    });

    it('collects stringified boolean values for an Other series', () => {
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

        expect(result.topGroupValues).toEqual({
            segment: ['enterprise', 'self_serve'],
            orders_is_completed: ['true', 'false'],
        });
    });

    it('returns undefined topGroupValues when no Other series exists', () => {
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

        expect(result.topGroupValues).toBeUndefined();
    });

    it('deduplicates pivot values across series for Other drill-through', () => {
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

        // 'US' appears in two series but should be deduplicated
        expect(result.topGroupValues).toEqual({
            region: ['US'],
        });
    });
});
