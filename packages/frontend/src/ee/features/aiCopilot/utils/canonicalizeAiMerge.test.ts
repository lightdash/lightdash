import { MergeJoinType, type MergeQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    parseMergeState,
    serializeMergeState,
} from '../../../../features/mergeQuery/context/mergeUrlState';
import { canonicalizeAiMerge, remapFieldIdsDeep } from './canonicalizeAiMerge';

const aiMergeQuery: MergeQuery = {
    sources: [
        {
            id: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
        },
        {
            id: 'subs',
            metricQuery: {
                exploreName: 'subscriptions',
                dimensions: ['subscriptions_subscription_start_month'],
                metrics: ['subscriptions_total_monthly_mrr'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
        },
    ],
    joinKey: [
        {
            name: 'month',
            fieldIdBySourceId: {
                orders: 'orders_order_date_month',
                subs: 'subscriptions_subscription_start_month',
            },
        },
    ],
    joinType: MergeJoinType.FULL,
    tableCalculations: [],
    limit: 500,
};

describe('canonicalizeAiMerge', () => {
    it('renames sources and join keys to the merge editor conventions', () => {
        const canonical = canonicalizeAiMerge(aiMergeQuery);

        expect(canonical?.mergeQuery.sources.map((s) => s.id)).toEqual([
            'a',
            'b',
        ]);
        expect(canonical?.mergeQuery.joinKey).toEqual([
            {
                name: 'join_key_0',
                fieldIdBySourceId: {
                    a: 'orders_order_date_month',
                    b: 'subscriptions_subscription_start_month',
                },
            },
        ]);
        expect(canonical?.fieldIdByAiFieldId).toEqual({
            merge_month: 'merge_join_key_0',
            orders_orders_total_order_amount: 'a_orders_total_order_amount',
            subs_subscriptions_total_monthly_mrr:
                'b_subscriptions_total_monthly_mrr',
        });
    });

    it('serializes into merge URL state the editor parses back', () => {
        const canonical = canonicalizeAiMerge(aiMergeQuery);
        if (!canonical) throw new Error('expected a canonical merge');
        const [primary, additional] = canonical.mergeQuery.sources;

        const parsed = parseMergeState(
            serializeMergeState({
                focus: { kind: 'source', sourceId: primary.id },
                additionalSources: [
                    {
                        id: additional.id,
                        exploreName: additional.metricQuery.exploreName,
                        dimensions: additional.metricQuery.dimensions,
                        metrics: additional.metricQuery.metrics,
                        filters: additional.metricQuery.filters,
                        additionalMetrics:
                            additional.metricQuery.additionalMetrics,
                        customDimensions:
                            additional.metricQuery.customDimensions,
                    },
                ],
                joinParts: canonical.mergeQuery.joinKey.map((part) => ({
                    fieldIdBySourceId: part.fieldIdBySourceId,
                })),
                joinType: canonical.mergeQuery.joinType,
            }),
        );

        expect(parsed).toEqual({
            focus: { kind: 'source', sourceId: 'a' },
            additionalSources: [
                {
                    id: 'b',
                    exploreName: 'subscriptions',
                    dimensions: ['subscriptions_subscription_start_month'],
                    metrics: ['subscriptions_total_monthly_mrr'],
                    filters: {},
                    additionalMetrics: [],
                    customDimensions: undefined,
                },
            ],
            joinParts: [
                {
                    fieldIdBySourceId: {
                        a: 'orders_order_date_month',
                        b: 'subscriptions_subscription_start_month',
                    },
                },
            ],
            joinType: MergeJoinType.FULL,
        });
    });

    it('remaps exact field-id strings and object keys, nothing else', () => {
        const remapped = remapFieldIdsDeep(
            {
                yAxisMetrics: ['orders_orders_total_order_amount'],
                merge_month: { label: 'Month, including merge_month text' },
            },
            canonicalizeAiMerge(aiMergeQuery)!.fieldIdByAiFieldId,
        );

        expect(remapped).toEqual({
            yAxisMetrics: ['a_orders_total_order_amount'],
            merge_join_key_0: {
                label: 'Month, including merge_month text',
            },
        });
    });
});
