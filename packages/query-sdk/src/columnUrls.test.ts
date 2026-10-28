import { describe, expect, it } from 'vitest';
import { resolveColumnUrls } from './columnUrls';
import type { Column, Row } from './types';

const COLUMNS: Column[] = [
    { name: 'customer_id', label: 'Customer ID', type: 'number' },
    {
        name: 'first_name',
        label: 'First name',
        type: 'string',
        urls: [
            {
                label: 'URL from value',
                url: 'https://example.com/company/${value.formatted | url_encode }',
            },
            {
                label: 'URL from row value',
                url: 'https://example.com/company/${row.customers.customer_id.raw | url_encode }',
            },
            {
                label: 'Invalid URL with bad reference',
                url: 'https://example.com/company/${row.customer_id.raw | url_encode }',
            },
        ],
    },
];

const ROW: Row = { customer_id: 54, first_name: "Quo'te" };

const format = (row: Row, fieldId: string) =>
    fieldId === 'first_name' ? `Formatted ${row[fieldId]}` : String(row[fieldId]);

describe('resolveColumnUrls', () => {
    it('resolves value and row references, skipping invalid patterns', () => {
        expect(
            resolveColumnUrls({ column: COLUMNS[1], row: ROW, columns: COLUMNS, format }),
        ).toEqual([
            {
                label: 'URL from value',
                href: "https://example.com/company/Formatted%20Quo'te",
            },
            {
                label: 'URL from row value',
                href: 'https://example.com/company/54',
            },
        ]);
    });

    it('falls back to raw for formatted references without a format function', () => {
        const [first] = resolveColumnUrls({
            column: COLUMNS[1],
            row: ROW,
            columns: COLUMNS,
        });
        expect(first.href).toBe("https://example.com/company/Quo'te");
    });

    it('resolves joined-table row references via dot-notation column names', () => {
        const columns: Column[] = [
            { name: 'orders.order_id', label: 'Order ID', type: 'number' },
            {
                name: 'status',
                label: 'Status',
                type: 'string',
                urls: [
                    {
                        label: 'Order',
                        url: 'https://example.com/orders/${row.orders.order_id.raw}',
                    },
                ],
            },
        ];
        expect(
            resolveColumnUrls({
                column: columns[1],
                row: { 'orders.order_id': 7, status: 'completed' },
                columns,
            }),
        ).toEqual([{ label: 'Order', href: 'https://example.com/orders/7' }]);
    });

    it('returns nothing for null cells, unknown filters, or columns without urls', () => {
        expect(
            resolveColumnUrls({
                column: COLUMNS[1],
                row: { customer_id: 54, first_name: null },
                columns: COLUMNS,
            }),
        ).toEqual([]);
        expect(
            resolveColumnUrls({
                column: {
                    ...COLUMNS[1],
                    urls: [{ label: 'x', url: 'https://x/${value.raw | upcase}' }],
                },
                row: ROW,
                columns: COLUMNS,
            }),
        ).toEqual([]);
        expect(
            resolveColumnUrls({ column: COLUMNS[0], row: ROW, columns: COLUMNS }),
        ).toEqual([]);
    });
});
