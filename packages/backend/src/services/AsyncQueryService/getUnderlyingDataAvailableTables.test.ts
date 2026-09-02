import {
    DimensionType,
    FieldType,
    MetricType,
    type Explore,
    type ItemsMap,
} from '@lightdash/common';
import { getUnderlyingDataAvailableTables } from './getUnderlyingDataAvailableTables';

const explore: Pick<Explore, 'baseTable' | 'joinedTables'> = {
    baseTable: 'customers',
    joinedTables: [
        { table: 'orders' },
        { table: 'payments' },
    ] as Explore['joinedTables'],
};

const ordersCount: ItemsMap = {
    orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.order_id',
        hidden: false,
    },
};

describe('getUnderlyingDataAvailableTables', () => {
    it('includes the base table even when no queried field belongs to it', () => {
        // A chart on the `customers` explore that only queries `orders.count`
        // must still be able to show `customers.*` underlying columns.
        const tables = getUnderlyingDataAvailableTables(explore, ordersCount);

        expect(tables.has('customers')).toBe(true);
    });

    it('includes every joined table of the explore', () => {
        const tables = getUnderlyingDataAvailableTables(explore, ordersCount);

        expect(tables.has('orders')).toBe(true);
        expect(tables.has('payments')).toBe(true);
    });

    it('includes tables of the queried fields', () => {
        const tables = getUnderlyingDataAvailableTables(explore, {
            ...ordersCount,
            extra_dim: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                name: 'dim',
                label: 'Dim',
                table: 'extra',
                tableLabel: 'Extra',
                sql: '${TABLE}.dim',
                hidden: false,
            },
        });

        expect(tables.has('extra')).toBe(true);
    });

    it('ignores non-field items such as table calculations', () => {
        const tables = getUnderlyingDataAvailableTables(explore, {
            calc: {
                name: 'calc',
                displayName: 'Calc',
                sql: '1',
            },
        } as unknown as ItemsMap);

        expect([...tables]).toEqual(['customers', 'orders', 'payments']);
    });
});
