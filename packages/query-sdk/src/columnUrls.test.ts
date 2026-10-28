import { describe, expect, it } from 'vitest';
import { resolveColumnUrls } from './columnUrls';
import type { Column, Row } from './types';

const COLUMNS: Column[] = [
    {
        name: 'customer_id',
        label: 'Customer ID',
        type: 'number',
        fieldId: 'customers_customer_id',
    },
    {
        name: 'first_name',
        label: 'First name',
        type: 'string',
        fieldId: 'customers_first_name',
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

    it('resolves joined-table row references through fieldId', () => {
        const columns: Column[] = [
            {
                name: 'orders.order_id',
                label: 'Order ID',
                type: 'number',
                fieldId: 'orders_order_id',
            },
            {
                name: 'status',
                label: 'Status',
                type: 'string',
                fieldId: 'orders_status',
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

    it('resolves row references in underlying-data results keyed by qualified field id', () => {
        const columns: Column[] = [
            {
                name: 'customers_customer_id',
                label: 'Customer ID',
                type: 'number',
                fieldId: 'customers_customer_id',
            },
            {
                name: 'customers_first_name',
                label: 'First name',
                type: 'string',
                fieldId: 'customers_first_name',
                urls: [
                    {
                        label: 'URL from row value',
                        url: 'https://example.com/company/${row.customers.customer_id.raw | url_encode }',
                    },
                ],
            },
        ];
        expect(
            resolveColumnUrls({
                column: columns[1],
                row: {
                    customers_customer_id: 54,
                    customers_first_name: 'Rose',
                },
                columns,
            }),
        ).toEqual([
            {
                label: 'URL from row value',
                href: 'https://example.com/company/54',
            },
        ]);
    });

    it('never matches a same-named field on a different table', () => {
        const columns: Column[] = [
            // Base table's own `id` — must NOT satisfy ${row.customers.id}.
            { name: 'id', label: 'ID', type: 'number', fieldId: 'orders_id' },
            {
                name: 'status',
                label: 'Status',
                type: 'string',
                fieldId: 'orders_status',
                urls: [
                    {
                        label: 'Customer',
                        url: 'https://example.com/customers/${row.customers.id.raw}',
                    },
                ],
            },
        ];
        expect(
            resolveColumnUrls({
                column: columns[1],
                row: { id: 99, status: 'completed' },
                columns,
            }),
        ).toEqual([]);
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
