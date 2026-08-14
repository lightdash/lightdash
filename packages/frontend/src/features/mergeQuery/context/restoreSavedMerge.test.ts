import { MergeJoinType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { restoreSavedMerge } from './restoreSavedMerge';

describe('restoreSavedMerge', () => {
    it('ignores an unsupported cached merge shape', () => {
        const unsupportedMerge = {
            secondQuery: {
                metricQuery: {
                    exploreName: 'subscriptions',
                },
            },
        };

        expect(restoreSavedMerge(unsupportedMerge)).toBeNull();
    });

    it('restores the current saved merge shape', () => {
        expect(
            restoreSavedMerge({
                primarySourceId: 'orders',
                sources: [
                    { id: 'orders', kind: 'chart' },
                    {
                        id: 'subscriptions',
                        kind: 'query',
                        metricQuery: {
                            exploreName: 'subscriptions',
                            dimensions: ['subscriptions_month'],
                            metrics: ['subscriptions_mrr'],
                            filters: {},
                            sorts: [],
                            limit: 500,
                            tableCalculations: [],
                        },
                    },
                ],
                joinKey: [
                    {
                        name: 'month',
                        fieldIdBySourceId: {
                            orders: 'orders_month',
                            subscriptions: 'subscriptions_month',
                        },
                    },
                ],
                joinType: MergeJoinType.FULL,
                tableCalculations: [],
            }),
        ).toMatchObject({
            queryB: {
                exploreName: 'subscriptions',
                dimensions: ['subscriptions_month'],
                metrics: ['subscriptions_mrr'],
            },
            joinParts: [
                {
                    fieldA: 'orders_month',
                    fieldB: 'subscriptions_month',
                },
            ],
            joinType: MergeJoinType.FULL,
        });
    });
});
