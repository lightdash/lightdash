import { type ResultRow } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getColumnValuesText } from './getColumnValuesText';

const row = (values: Record<string, { raw: unknown; formatted: string }>) =>
    Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, { value }]),
    ) as ResultRow;

describe('getColumnValuesText', () => {
    it('joins the formatted values of one column in row order', () => {
        const rows = [
            row({
                orders_order_id: { raw: 3, formatted: '3' },
                orders_amount: { raw: 32, formatted: '$32.00' },
            }),
            row({
                orders_order_id: { raw: 1, formatted: '1' },
                orders_amount: { raw: 1234.5, formatted: '$1,234.50' },
            }),
        ];

        expect(getColumnValuesText(rows, 'orders_order_id')).toBe('3\n1');
        expect(getColumnValuesText(rows, 'orders_amount')).toBe(
            '$32.00\n$1,234.50',
        );
    });

    it('renders null cells as empty lines instead of the ∅ placeholder', () => {
        const rows = [
            row({ orders_status: { raw: 'placed', formatted: 'placed' } }),
            row({ orders_status: { raw: null, formatted: '∅' } }),
            row({ orders_status: { raw: 'shipped', formatted: 'shipped' } }),
        ];

        expect(getColumnValuesText(rows, 'orders_status')).toBe(
            'placed\n\nshipped',
        );
    });

    it('renders a missing column as an empty line', () => {
        const rows = [
            row({ orders_status: { raw: 'placed', formatted: 'placed' } }),
            row({}),
        ];

        expect(getColumnValuesText(rows, 'orders_status')).toBe('placed\n');
    });

    it('returns an empty string when there are no rows', () => {
        expect(getColumnValuesText([], 'orders_status')).toBe('');
    });
});
