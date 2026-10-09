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
const createdWeek = grain('created_week', 'Created week', TimeFrames.WEEK);
const created = dimension('created', 'Created', { type: DimensionType.DATE });
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

describe('getTileFieldCandidateIds', () => {
    it('lists what a tile offers once per field, sorted by table then name', () => {
        expect(
            getTileFieldCandidateIds(
                [status, region, amount, customerStatus],
                ['orders_status'],
                status,
            ),
        ).toEqual(['customers_status', 'orders_region']);
    });

    it('lists every grain of a date, base field first, then in time frame order', () => {
        expect(
            getTileFieldCandidateIds(
                [shipped, createdMonth, createdDay, created, createdWeek],
                ['orders_shipped'],
                createdDay,
            ),
        ).toEqual([
            'orders_created',
            'orders_created_day',
            'orders_created_week',
            'orders_created_month',
        ]);
    });

    it('offers another grain of a date the filter already has', () => {
        expect(
            getTileFieldCandidateIds(
                [createdDay, createdMonth, shipped],
                ['orders_created_month'],
                createdMonth,
            ),
        ).toEqual(['orders_created_day', 'orders_shipped']);
    });

    it('lists nothing for a tile with no fields', () => {
        expect(getTileFieldCandidateIds([], [], status)).toEqual([]);
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
        expect(getTileFieldCandidateIds([amount, revenue], [], amount)).toEqual(
            ['orders_amount'],
        );
    });

    it('are what a filter on a metric is offered', () => {
        expect(
            getTileFieldCandidateIds(
                [amount, revenue, profit],
                ['orders_revenue'],
                revenue,
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

    it('start a control from any grain of a date', () => {
        expect(
            getTileStarterFieldIds([status, createdMonth, createdDay], false),
        ).toEqual([
            'orders_created_day',
            'orders_created_month',
            'orders_status',
        ]);
    });
});

describe('getCandidateOptions', () => {
    const fieldsMap = Object.fromEntries(
        all.map((field) => [`${field.table}_${field.name}`, field]),
    );

    it('labels a candidate by its own label, a grain included', () => {
        expect(
            getCandidateOptions(
                ['orders_region', 'orders_created_day', 'orders_created_month'],
                ['Status'],
                fieldsMap,
            ),
        ).toEqual([
            { value: 'orders_region', label: 'Region' },
            { value: 'orders_created_day', label: 'Created day' },
            { value: 'orders_created_month', label: 'Created month' },
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
