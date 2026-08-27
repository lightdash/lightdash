import { DimensionType, type ResultColumns } from '@lightdash/common';
import { getInheritedReferencedColumns } from './inheritReferencedColumns';

const ordersColumns: ResultColumns = {
    orders_status: {
        reference: 'orders_status',
        type: DimensionType.STRING,
        label: 'Orders Status',
        provenance: { fieldId: 'orders_status' },
    },
    orders_revenue: {
        reference: 'orders_revenue',
        type: DimensionType.NUMBER,
        label: 'Orders Revenue',
        format: '#,##0.00',
        provenance: { fieldId: 'orders_revenue' },
    },
};

const paymentsColumns: ResultColumns = {
    payments_method: {
        reference: 'payments_method',
        type: DimensionType.STRING,
        label: 'Payments Method',
        provenance: { fieldId: 'payments_method' },
    },
    orders_revenue: {
        reference: 'orders_revenue',
        type: DimensionType.NUMBER,
        label: 'Orders Revenue',
        provenance: { fieldId: 'orders_revenue' },
    },
};

describe('getInheritedReferencedColumns', () => {
    test('pass-through columns inherit metadata scoped to the referenced query', () => {
        const inherited = getInheritedReferencedColumns(
            [{ name: 'orders_revenue', type: DimensionType.NUMBER }],
            [{ queryUuid: 'orders-query-uuid', columns: ordersColumns }],
        );
        expect(inherited.orders_revenue).toEqual({
            reference: 'orders_revenue',
            type: DimensionType.NUMBER,
            label: 'Orders Revenue',
            format: '#,##0.00',
            provenance: {
                fieldId: 'orders_revenue',
                sourceQueryUuid: 'orders-query-uuid',
            },
        });
    });

    test('an existing sourceQueryUuid is kept — the fieldId keys into that deeper query', () => {
        const upstreamComposeColumns: ResultColumns = {
            orders_revenue: {
                reference: 'orders_revenue',
                type: DimensionType.NUMBER,
                label: 'Orders Revenue',
                provenance: {
                    fieldId: 'orders_revenue',
                    sourceQueryUuid: 'deeper-query-uuid',
                },
            },
        };
        const inherited = getInheritedReferencedColumns(
            [{ name: 'orders_revenue', type: DimensionType.NUMBER }],
            [
                {
                    queryUuid: 'direct-reference-uuid',
                    columns: upstreamComposeColumns,
                },
            ],
        );
        expect(inherited.orders_revenue.provenance).toEqual({
            fieldId: 'orders_revenue',
            sourceQueryUuid: 'deeper-query-uuid',
        });
    });

    test('columns without provenance still inherit display metadata', () => {
        const rawSqlColumns: ResultColumns = {
            payment_method: {
                reference: 'payment_method',
                type: DimensionType.STRING,
                label: 'Payment method',
            },
        };
        const inherited = getInheritedReferencedColumns(
            [{ name: 'payment_method', type: DimensionType.STRING }],
            [{ queryUuid: 'sql-query-uuid', columns: rawSqlColumns }],
        );
        expect(inherited.payment_method).toEqual({
            reference: 'payment_method',
            type: DimensionType.STRING,
            label: 'Payment method',
        });
    });

    test('a name present in two references is ambiguous and inherits nothing', () => {
        const inherited = getInheritedReferencedColumns(
            [{ name: 'orders_revenue', type: DimensionType.NUMBER }],
            [
                { queryUuid: 'orders-query-uuid', columns: ordersColumns },
                { queryUuid: 'payments-query-uuid', columns: paymentsColumns },
            ],
        );
        expect(inherited.orders_revenue).toBeUndefined();
    });

    test('a probed type mismatch marks the column computed and inherits nothing', () => {
        const inherited = getInheritedReferencedColumns(
            // e.g. CAST(orders_revenue AS VARCHAR) AS orders_revenue
            [{ name: 'orders_revenue', type: DimensionType.STRING }],
            [{ queryUuid: 'orders-query-uuid', columns: ordersColumns }],
        );
        expect(inherited.orders_revenue).toBeUndefined();
    });

    test('computed columns with no referenced match inherit nothing', () => {
        const inherited = getInheritedReferencedColumns(
            [{ name: 'revenue_per_order', type: DimensionType.NUMBER }],
            [{ queryUuid: 'orders-query-uuid', columns: ordersColumns }],
        );
        expect(inherited).toEqual({});
    });

    test('references with no persisted columns are skipped', () => {
        const inherited = getInheritedReferencedColumns(
            [{ name: 'orders_status', type: DimensionType.STRING }],
            [
                { queryUuid: 'pre-migration-uuid', columns: null },
                { queryUuid: 'orders-query-uuid', columns: ordersColumns },
            ],
        );
        expect(inherited.orders_status).toEqual({
            reference: 'orders_status',
            type: DimensionType.STRING,
            label: 'Orders Status',
            provenance: {
                fieldId: 'orders_status',
                sourceQueryUuid: 'orders-query-uuid',
            },
        });
    });
});
