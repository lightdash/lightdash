import {
    DimensionType,
    FieldType,
    TimeFrames,
    type DashboardFilterableField,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getFieldCandidates } from './fieldCandidates';

const dimension = (
    name: string,
    label: string,
    extra: Partial<FilterableDimension> = {},
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
    ...extra,
});

const grain = (name: string, label: string, timeInterval: TimeFrames) =>
    dimension(name, label, {
        type: DimensionType.DATE,
        timeInterval,
        timeIntervalBaseDimensionName: 'created',
    });

const status = dimension('status', 'Status');
const region = dimension('region', 'Region');
const amount = dimension('amount', 'Amount', { type: DimensionType.NUMBER });
const customerStatus = dimension('status', 'Status', {
    table: 'customers',
    tableLabel: 'Customers',
});
const createdDay = grain('created_day', 'Created day', TimeFrames.DAY);
const createdMonth = grain('created_month', 'Created month', TimeFrames.MONTH);
const shipped = dimension('shipped', 'Shipped', { type: DimensionType.DATE });
const all = [
    status,
    region,
    amount,
    customerStatus,
    createdDay,
    createdMonth,
    shipped,
];
const ids = (fields: DashboardFilterableField[]) =>
    fields.map((field) => `${field.table}_${field.name}`);

describe('getFieldCandidates', () => {
    it('keeps the fields of the type that the filter does not have', () => {
        expect(ids(getFieldCandidates(all, ['orders_status'], status))).toEqual(
            ['orders_region', 'customers_status'],
        );
        expect(ids(getFieldCandidates(all, [], amount))).toEqual([
            'orders_amount',
        ]);
    });

    it('offers the other grains of a date the filter already has', () => {
        expect(
            ids(
                getFieldCandidates(all, ['orders_created_month'], createdMonth),
            ),
        ).toEqual(['orders_created_day', 'orders_shipped']);
    });
});

describe('date and time fields', () => {
    const orderDate = dimension('order_date', 'Order date', {
        type: DimensionType.DATE,
    });
    const shipDate = dimension('ship_date', 'Ship date', {
        type: DimensionType.DATE,
    });
    const paidAt = dimension('paid_at', 'Paid at', {
        type: DimensionType.TIMESTAMP,
    });

    // One filter value cannot mean the same on a day and on a moment
    it('offers a date filter dates only, and a timestamp filter timestamps only', () => {
        expect(
            ids(
                getFieldCandidates(
                    [shipDate, paidAt],
                    ['orders_order_date'],
                    orderDate,
                ),
            ),
        ).toEqual(['orders_ship_date']);
        expect(
            ids(getFieldCandidates([orderDate, shipDate], [], paidAt)),
        ).toEqual([]);
    });
});
