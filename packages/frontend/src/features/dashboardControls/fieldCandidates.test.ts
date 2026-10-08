import {
    DimensionType,
    FieldType,
    TimeFrames,
    type DashboardFilterableField,
    MetricType,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getCandidateOptions,
    getFieldCandidates,
    getGrainKey,
    getTileFieldCandidateIds,
    getTileStarterFieldIds,
} from './fieldCandidates';

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

describe('getGrainKey', () => {
    it('is shared by every grain of a time dimension', () => {
        expect(getGrainKey(createdDay)).toBe('orders.created');
        expect(getGrainKey(createdMonth)).toBe('orders.created');
        expect(getGrainKey(status)).toBe('orders.status');
    });
});

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

describe('getTileFieldCandidateIds', () => {
    it('lists what a tile offers once per field, sorted by table then name', () => {
        expect(
            getTileFieldCandidateIds(
                [status, region, amount, customerStatus],
                ['orders_status'],
                status,
                all,
            ),
        ).toEqual(['customers_status', 'orders_region']);
    });

    it('folds the grains of a date into the day grain', () => {
        expect(
            getTileFieldCandidateIds(
                [createdMonth, createdDay, shipped],
                ['orders_shipped'],
                createdDay,
                all,
            ),
        ).toEqual(['orders_created_day']);
    });

    it('offers no other grain of a date the filter already has', () => {
        expect(
            getTileFieldCandidateIds(
                [createdDay, shipped],
                ['orders_created_month'],
                createdMonth,
                all,
            ),
        ).toEqual(['orders_shipped']);
    });

    it('lists nothing for a tile with no fields', () => {
        expect(getTileFieldCandidateIds([], [], status, all)).toEqual([]);
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

describe('metrics on a tile', () => {
    // A tile reports its metrics next to its dimensions
    const metric = (name: string, label: string) =>
        ({
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name,
            label,
            table: 'orders',
            tableLabel: 'Orders',
            sql: '',
            hidden: false,
        }) as unknown as DashboardFilterableField;
    const revenue = metric('revenue', 'Revenue');
    const profit = metric('profit', 'Profit');

    it('are not offered to a filter on a dimension', () => {
        expect(
            getTileFieldCandidateIds([amount, revenue], [], amount, [amount]),
        ).toEqual(['orders_amount']);
    });

    it('are what a filter on a metric is offered', () => {
        expect(
            getTileFieldCandidateIds(
                [amount, revenue, profit],
                ['orders_revenue'],
                revenue,
                [revenue],
            ),
        ).toEqual(['orders_profit']);
    });

    it('start a control only where metric filters can be created', () => {
        expect(getTileStarterFieldIds([status, revenue], false)).toEqual([
            'orders_status',
        ]);
        expect(getTileStarterFieldIds([status, revenue], true)).toEqual([
            'orders_revenue',
            'orders_status',
        ]);
    });
});

describe('getCandidateOptions', () => {
    const fieldsMap = Object.fromEntries(
        all.map((field) => [`${field.table}_${field.name}`, field]),
    );

    it('labels a candidate like the filter fields, a date by its base name', () => {
        expect(
            getCandidateOptions(
                ['orders_region', 'orders_created_day'],
                ['Status'],
                fieldsMap,
            ),
        ).toEqual([
            { value: 'orders_region', label: 'Region' },
            { value: 'orders_created_day', label: 'Created' },
        ]);
    });

    it('adds the table label to an entry that reads like another one', () => {
        expect(
            getCandidateOptions(
                ['customers_status', 'orders_region'],
                ['Status'],
                fieldsMap,
            ),
        ).toEqual([
            { value: 'customers_status', label: 'Customers Status' },
            { value: 'orders_region', label: 'Region' },
        ]);
        expect(
            getCandidateOptions(
                ['customers_status', 'orders_status'],
                [],
                fieldsMap,
            ).map((option) => option.label),
        ).toEqual(['Customers Status', 'Orders Status']);
    });

    it('falls back to the id of an unknown field', () => {
        expect(getCandidateOptions(['gone'], [], fieldsMap)).toEqual([
            { value: 'gone', label: 'gone' },
        ]);
    });
});
