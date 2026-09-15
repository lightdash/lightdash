import { type ItemsMap } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { resolveVizUnderlyingDataConfig } from './vizUnderlyingDataConfig';

const metricItem = {
    fieldType: 'metric',
    type: 'sum',
    name: 'revenue',
    table: 'orders',
    label: 'Revenue',
    hidden: false,
} as unknown as ItemsMap[string];
const dimensionItem = {
    fieldType: 'dimension',
    type: 'string',
    name: 'status',
    table: 'orders',
    label: 'Status',
    hidden: false,
} as unknown as ItemsMap[string];

const itemsMap = {
    orders_revenue: metricItem,
    orders_status: dimensionItem,
} as ItemsMap;
const fieldMapping = { value: 'orders_revenue', category: 'orders_status' };
const row = {
    orders_revenue: { value: { raw: 42, formatted: '$42' } },
    orders_status: { value: { raw: 'done', formatted: 'Done' } },
    junk: { nope: true },
};

describe('resolveVizUnderlyingDataConfig', () => {
    it('resolves a metric click into the host modal config', () => {
        const dateZoom = {
            granularity: 'month',
            xAxisFieldId: 'orders_created_month',
        } as const;
        const config = resolveVizUnderlyingDataConfig(
            { row, metric: 'value' },
            { fieldMapping, itemsMap, dateZoom },
        );

        expect(config).toEqual({
            item: metricItem,
            value: { raw: 42, formatted: '$42' },
            fieldValues: {
                orders_revenue: { raw: 42, formatted: '$42' },
                orders_status: { raw: 'done', formatted: 'Done' },
            },
            dateZoom,
        });
    });

    it('rejects malformed, unmapped, and dimension intents', () => {
        expect(() =>
            resolveVizUnderlyingDataConfig(null, {
                fieldMapping,
                itemsMap,
                dateZoom: undefined,
            }),
        ).toThrow('Invalid underlying-data request.');
        expect(() =>
            resolveVizUnderlyingDataConfig(
                { row, metric: 'ghost' },
                { fieldMapping, itemsMap, dateZoom: undefined },
            ),
        ).toThrow('"ghost" is not bound to a query field on this chart.');
        expect(() =>
            resolveVizUnderlyingDataConfig(
                { row, metric: 'category' },
                { fieldMapping, itemsMap, dateZoom: undefined },
            ),
        ).toThrow('"category" is not a metric on this chart.');
    });
});
