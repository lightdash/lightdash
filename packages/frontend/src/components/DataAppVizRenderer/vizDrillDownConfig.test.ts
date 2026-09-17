import { type ItemsMap } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { resolveVizDrillDownConfig } from './vizDrillDownConfig';

// Minimal metric/dimension shaped like ItemsMap entries — only the fields
// isField/isMetric discriminate on.
const metricItem = {
    fieldType: 'metric',
    type: 'count',
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
    orders_revenue: { value: { raw: 42, formatted: '42' } },
    orders_status: { value: { raw: 'done', formatted: 'Done' } },
    junk: { nope: true },
};

describe('resolveVizDrillDownConfig', () => {
    it('resolves a valid intent to a DrillDownConfig', () => {
        const config = resolveVizDrillDownConfig(
            { row, metric: 'value' },
            { fieldMapping, itemsMap },
        );
        expect(config.item).toBe(metricItem);
        expect(config.fieldValues).toEqual({
            orders_revenue: { raw: 42, formatted: '42' },
            orders_status: { raw: 'done', formatted: 'Done' },
        });
    });

    it('rejects a malformed intent', () => {
        expect(() =>
            resolveVizDrillDownConfig(
                { metric: 42 },
                { fieldMapping, itemsMap },
            ),
        ).toThrow('Invalid drill-down request.');
    });

    it('rejects a metric name not bound on this chart', () => {
        expect(() =>
            resolveVizDrillDownConfig(
                { row, metric: 'ghost' },
                { fieldMapping, itemsMap },
            ),
        ).toThrow('"ghost" is not bound to a query field on this chart.');
    });

    it('rejects a slot bound to a non-metric', () => {
        expect(() =>
            resolveVizDrillDownConfig(
                { row, metric: 'category' },
                { fieldMapping, itemsMap },
            ),
        ).toThrow('"category" is not a metric on this chart.');
    });

    it('requires a selected member for a multi-metric slot', () => {
        const multiMapping = {
            ...fieldMapping,
            value: ['orders_revenue', 'orders_status'],
        };
        expect(() =>
            resolveVizDrillDownConfig(
                { row, metric: 'value' },
                { fieldMapping: multiMapping, itemsMap },
            ),
        ).toThrow('"value" has multiple fields; choose a bound field id.');
        expect(
            resolveVizDrillDownConfig(
                { row, metric: 'value', fieldId: 'orders_revenue' },
                { fieldMapping: multiMapping, itemsMap },
            ).item,
        ).toBe(metricItem);
    });

    it('rejects an explicit field id outside a scalar binding', () => {
        expect(() =>
            resolveVizDrillDownConfig(
                { row, metric: 'value', fieldId: 'orders_status' },
                { fieldMapping, itemsMap },
            ),
        ).toThrow('"orders_status" is not bound to "value" on this chart.');
    });
});
