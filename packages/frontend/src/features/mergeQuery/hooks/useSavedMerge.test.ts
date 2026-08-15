import { MergeJoinType, type MergeQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toSavedMerge } from './useSavedMerge';

const metricQuery = (exploreName: string) => ({
    exploreName,
    dimensions: [`${exploreName}_date`],
    metrics: [`${exploreName}_total`],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});

describe('toSavedMerge', () => {
    it('persists the exact effective join used by the runtime', () => {
        const mergeQuery: MergeQuery = {
            sources: [
                { id: 'a', metricQuery: metricQuery('orders') },
                { id: 'b', metricQuery: metricQuery('payments') },
            ],
            joinKey: [
                {
                    name: 'k0',
                    fieldIdBySourceId: {
                        a: 'orders_suggested_date',
                        b: 'payments_suggested_date',
                    },
                },
                {
                    name: 'k1',
                    fieldIdBySourceId: {
                        a: 'orders_status',
                        b: 'payments_status',
                    },
                },
            ],
            joinType: MergeJoinType.INNER,
            tableCalculations: [],
            limit: 500,
        };

        expect(toSavedMerge(mergeQuery)).toEqual({
            primarySourceId: 'a',
            sources: [
                { id: 'a', kind: 'chart' },
                {
                    id: 'b',
                    kind: 'query',
                    metricQuery: metricQuery('payments'),
                },
            ],
            joinKey: [
                {
                    name: 'k0',
                    fieldIdBySourceId: {
                        a: 'orders_suggested_date',
                        b: 'payments_suggested_date',
                    },
                },
                {
                    name: 'k1',
                    fieldIdBySourceId: {
                        a: 'orders_status',
                        b: 'payments_status',
                    },
                },
            ],
            joinType: MergeJoinType.INNER,
            tableCalculations: [],
        });
    });

    it('persists additional sources without changing the schema', () => {
        const mergeQuery: MergeQuery = {
            sources: [
                { id: 'a', metricQuery: metricQuery('orders') },
                { id: 'payments', metricQuery: metricQuery('payments') },
                {
                    id: 'subscriptions',
                    metricQuery: metricQuery('subscriptions'),
                },
            ],
            joinKey: [
                {
                    name: 'date',
                    fieldIdBySourceId: {
                        a: 'orders_date',
                        payments: 'payments_date',
                        subscriptions: 'subscriptions_date',
                    },
                },
            ],
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
            limit: 500,
        };

        expect(toSavedMerge(mergeQuery)).toMatchObject({
            primarySourceId: 'a',
            sources: [
                { id: 'a', kind: 'chart' },
                { id: 'payments', kind: 'query' },
                { id: 'subscriptions', kind: 'query' },
            ],
            joinKey: [
                {
                    fieldIdBySourceId: {
                        a: 'orders_date',
                        payments: 'payments_date',
                        subscriptions: 'subscriptions_date',
                    },
                },
            ],
        });
    });
});
