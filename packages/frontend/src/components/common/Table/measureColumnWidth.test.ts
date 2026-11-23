import { describe, expect, it } from 'vitest';
import {
    getRowNumberWidth,
    measureColumnWidth,
    measureExploreColumn,
} from './measureColumnWidth';

describe('table column widths', () => {
    it('fits the header controls and the widest formatted value', () => {
        expect(measureColumnWidth('ID', [], 32)).toBe(
            measureColumnWidth('ID', []) + 32,
        );
        expect(measureColumnWidth('ID', ['$9,999,999.99'])).toBeGreaterThan(
            measureColumnWidth('ID', ['1'], 20),
        );
    });

    it('wraps Explore field names over the table label without widening the column', () => {
        const short = measureExploreColumn('Orders\nAmount', ['1'], 18);
        const wrapped = measureExploreColumn(
            'Orders\nAmount Plus Shipping Band',
            ['1'],
            18,
        );
        expect(wrapped.width).toBe(short.width);
        expect(wrapped.headerHeight).toBeGreaterThan(short.headerHeight);
    });

    it('reserves room for row numbers and a visible Total footer', () => {
        expect(getRowNumberWidth(1, true)).toBeGreaterThan(
            getRowNumberWidth(1, false),
        );
        expect(getRowNumberWidth(99999999, false)).toBeGreaterThan(
            getRowNumberWidth(1, true),
        );
    });
});
