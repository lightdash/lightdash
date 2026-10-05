import { describe, expect, it } from 'vitest';
import {
    formatDisplayLabel,
    getDisplayLabels,
    getFullDisplayLabels,
    getTileDisplayLabels,
    type LabelledItem,
} from './labels';

const ordersStatus: LabelledItem = {
    id: 'orders_status',
    label: 'Order status',
    group: 'Orders',
};
const paymentsStatus: LabelledItem = {
    id: 'payments_status',
    label: 'Order status',
    group: 'Payments',
};
const plan: LabelledItem = {
    id: 'subscriptions_plan',
    label: 'Plan',
    group: 'Subscriptions',
};

describe('getDisplayLabels', () => {
    it('shows the field label alone while every label is unique', () => {
        expect(getDisplayLabels([ordersStatus, plan])).toEqual({
            orders_status: { label: 'Order status', group: null },
            subscriptions_plan: { label: 'Plan', group: null },
        });
    });

    it('adds the table name to the fields that share a label, and only to them', () => {
        expect(getDisplayLabels([ordersStatus, paymentsStatus, plan])).toEqual({
            orders_status: { label: 'Order status', group: 'Orders' },
            payments_status: { label: 'Order status', group: 'Payments' },
            subscriptions_plan: { label: 'Plan', group: null },
        });
    });

    it('adds the model name to parameters with the same label on two models', () => {
        const labels = getDisplayLabels([
            { id: 'orders.grain', label: 'Reporting period', group: 'Orders' },
            {
                id: 'customers.grain',
                label: 'Reporting period',
                group: 'Customers',
            },
        ]);
        expect(Object.values(labels).map(formatDisplayLabel)).toEqual([
            'Orders Reporting period',
            'Customers Reporting period',
        ]);
    });

    it('has no name to add for project parameters', () => {
        expect(
            getDisplayLabels([
                { id: 'tracked_status', label: 'Status', group: null },
                { id: 'orders.status', label: 'Status', group: 'Orders' },
                { id: 'sales_channel', label: 'Sales channel', group: null },
            ]),
        ).toEqual({
            tracked_status: { label: 'Status', group: null },
            'orders.status': { label: 'Status', group: 'Orders' },
            sales_channel: { label: 'Sales channel', group: null },
        });
    });

    it('counts an item listed twice once', () => {
        expect(getDisplayLabels([ordersStatus, ordersStatus])).toEqual({
            orders_status: { label: 'Order status', group: null },
        });
    });
});

describe('getTileDisplayLabels', () => {
    it("tells a tile's own options apart among themselves", () => {
        expect(getTileDisplayLabels([ordersStatus, plan], {})).toEqual({
            orders_status: { label: 'Order status', group: null },
            subscriptions_plan: { label: 'Plan', group: null },
        });
        expect(
            getTileDisplayLabels([ordersStatus, paymentsStatus], {})
                .payments_status,
        ).toEqual({ label: 'Order status', group: 'Payments' });
    });

    it('reads an option that has a row in the panel as that row, mapped or not', () => {
        // The panel shows both status fields, so the row carries the table
        const rowLabels = {
            orders_status: { label: 'Order status', group: 'Orders' },
            payments_status: { label: 'Order status', group: 'Payments' },
        };
        // A cleared tile offers what its mapped neighbours show
        expect(getTileDisplayLabels([ordersStatus, plan], rowLabels)).toEqual({
            orders_status: rowLabels.orders_status,
            subscriptions_plan: { label: 'Plan', group: null },
        });
    });
});

describe('getFullDisplayLabels', () => {
    it('names every item with its table, alone in the set or not', () => {
        expect(getFullDisplayLabels([ordersStatus])).toEqual({
            [ordersStatus.id]: {
                label: ordersStatus.label,
                group: ordersStatus.group,
            },
        });
    });
});
