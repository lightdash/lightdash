import { MergeJoinType, type MergeQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toSavedMergeDefinition } from './useSavedMerge';

const metricQuery = (exploreName: string) => ({
    exploreName,
    dimensions: [`${exploreName}_date`],
    metrics: [`${exploreName}_total`],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});

describe('toSavedMergeDefinition', () => {
    it('persists the exact effective join used by the runtime, the chart query by reference', () => {
        const mergeQuery: MergeQuery = {
            sources: [
                { id: 'orders', metricQuery: metricQuery('orders') },
                { id: 'payments', metricQuery: metricQuery('payments') },
            ],
            joinKey: [
                {
                    name: 'orders_suggested_date',
                    fieldIdBySourceId: {
                        orders: 'orders_suggested_date',
                        payments: 'payments_suggested_date',
                    },
                },
                {
                    name: 'orders_status',
                    fieldIdBySourceId: {
                        orders: 'orders_status',
                        payments: 'payments_status',
                    },
                },
            ],
            joinType: MergeJoinType.INNER,
            tableCalculations: [
                {
                    name: 'payment_rate',
                    displayName: 'Payment rate',
                    sql: '',
                    formula: '=payments_payments_total / orders_orders_total',
                },
            ],
            sorts: [
                { fieldId: 'payments_payments_total', descending: true },
                { fieldId: 'merge_payment_rate', descending: false },
            ],
            limit: 500,
        };

        expect(toSavedMergeDefinition(mergeQuery, 'orders')).toEqual({
            queries: {
                payments: {
                    explore: 'payments',
                    dimensions: ['payments_date'],
                    metrics: ['payments_total'],
                },
            },
            join: MergeJoinType.INNER,
            keys: {
                orders_suggested_date: ['payments.payments_suggested_date'],
                orders_status: ['payments.payments_status'],
            },
            sort: [
                { by: 'payments.payments_total', direction: 'desc' },
                { by: 'payment_rate', direction: 'asc' },
            ],
            limit: 500,
            tableCalculations: [
                {
                    name: 'payment_rate',
                    displayName: 'Payment rate',
                    sql: '',
                    formula: '=payments_payments_total / orders_orders_total',
                },
            ],
        });
    });

    it('keeps the names a saved chart fixed and the repeat flag per query', () => {
        const mergeQuery: MergeQuery = {
            sources: [
                { id: 'a', metricQuery: metricQuery('orders') },
                {
                    id: 'b',
                    metricQuery: metricQuery('payments'),
                    repeatValues: true,
                },
            ],
            joinKey: [
                {
                    name: 'join_key_0',
                    fieldIdBySourceId: { a: 'orders_date', b: 'payments_date' },
                },
            ],
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
            limit: 500,
        };

        expect(toSavedMergeDefinition(mergeQuery, 'a')).toEqual({
            chartAs: 'a',
            queries: {
                b: {
                    explore: 'payments',
                    dimensions: ['payments_date'],
                    metrics: ['payments_total'],
                    repeat: true,
                },
            },
            join: MergeJoinType.FULL,
            keys: { orders_date: ['b.payments_date'] },
            keyNames: { orders_date: 'join_key_0' },
            limit: 500,
        });
    });
});
