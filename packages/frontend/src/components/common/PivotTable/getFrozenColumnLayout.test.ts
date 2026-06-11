import type { PivotColumn } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getFrozenColumnLayout } from './getFrozenColumnLayout';

const indexCol = (fieldId: string): PivotColumn => ({
    fieldId,
    baseId: undefined,
    underlyingId: undefined,
    columnType: 'indexValue',
});

const dataCol = (fieldId: string, baseId: string): PivotColumn => ({
    fieldId,
    baseId,
    underlyingId: undefined,
    columnType: undefined,
});

const labelCol = (fieldId: string): PivotColumn => ({
    fieldId,
    baseId: undefined,
    underlyingId: undefined,
    columnType: 'label',
});

describe('getFrozenColumnLayout', () => {
    it('returns an empty map when no columns are frozen', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [indexCol('orders_category')],
            columnProperties: {},
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.size).toBe(0);
    });

    it('starts cumulative left at rowNumberWidth when row numbers are shown', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [indexCol('orders_category')],
            columnProperties: { orders_category: { frozen: true } },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: true,
        });
    });

    it('starts cumulative left at 0 when row numbers are hidden', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [indexCol('orders_category')],
            columnProperties: { orders_category: { frozen: true } },
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 0,
            isLast: true,
        });
    });

    it('chains cumulative left across multiple frozen index columns', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                indexCol('orders_region'),
            ],
            columnProperties: {
                orders_category: { frozen: true, width: 120 },
                orders_region: { frozen: true, width: 80 },
            },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: false,
        });
        expect(layout.get('orders_region')).toEqual({
            left: 170,
            isLast: true,
        });
    });

    it('uses defaultColumnWidth when a frozen column has no explicit width', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                indexCol('orders_region'),
            ],
            columnProperties: {
                orders_category: { frozen: true },
                orders_region: { frozen: true, width: 80 },
            },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: false,
        });
        expect(layout.get('orders_region')).toEqual({
            left: 150,
            isLast: true,
        });
    });

    it('skips non-frozen columns but advances offset for frozen ones only', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                indexCol('orders_region'),
                indexCol('orders_segment'),
            ],
            columnProperties: {
                orders_category: { frozen: true, width: 120 },
                orders_segment: { frozen: true, width: 80 },
                // orders_region is NOT frozen — left offset for orders_segment
                // is computed from orders_category only.
            },
            rowNumberWidth: 50,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_category')).toEqual({
            left: 50,
            isLast: false,
        });
        expect(layout.has('orders_region')).toBe(false);
        expect(layout.get('orders_segment')).toEqual({
            left: 170,
            isLast: true,
        });
    });

    it('uses underlyingId/baseId as the freeze key for data columns', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                indexCol('orders_category'),
                dataCol('total_count__pivot_0', 'total_count'),
                dataCol('total_count__pivot_1', 'total_count'),
            ],
            columnProperties: {
                total_count: { frozen: true, width: 90 },
            },
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
        });
        // Both pivot slices of the same metric become sticky because the freeze
        // key resolves to the metric's baseId.
        expect(layout.get('total_count__pivot_0')).toEqual({
            left: 0,
            isLast: false,
        });
        expect(layout.get('total_count__pivot_1')).toEqual({
            left: 90,
            isLast: true,
        });
    });

    it('freezes the label column when labelColumnFrozen is true', () => {
        // In metricsAsRows mode the label column has a synthetic fieldId
        // ("label-0") that does not exist in columnProperties — the caller
        // bridges the metric's freeze flag via labelColumnFrozen.
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                labelCol('label-0'),
                dataCol('total_count__pivot_0', 'total_count'),
            ],
            columnProperties: {},
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
            labelColumnFrozen: true,
        });
        expect(layout.get('label-0')).toEqual({
            left: 0,
            isLast: true,
        });
        expect(layout.has('total_count__pivot_0')).toBe(false);
    });

    it('does NOT freeze the label column when labelColumnFrozen is false', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [labelCol('label-0')],
            columnProperties: {},
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
            labelColumnFrozen: false,
        });
        expect(layout.size).toBe(0);
    });

    it('prefers underlyingId over baseId as the freeze key for data columns', () => {
        const layout = getFrozenColumnLayout({
            pivotColumnInfo: [
                {
                    fieldId: 'orders_total_count__pivot_0',
                    baseId: 'orders_shipping_method',
                    underlyingId: 'orders_total_count',
                    columnType: undefined,
                },
            ],
            columnProperties: {
                orders_total_count: { frozen: true, width: 90 },
                // baseId match would also resolve to frozen, but underlyingId
                // takes priority — this property has frozen: false to prove it.
                orders_shipping_method: { frozen: false },
            },
            rowNumberWidth: 0,
            defaultColumnWidth: 100,
        });
        expect(layout.get('orders_total_count__pivot_0')).toEqual({
            left: 0,
            isLast: true,
        });
    });
});
