import { MergeJoinType, type MergeQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    parseMergeState,
    serializeMergeState,
} from '../../../../features/mergeQuery/context/mergeUrlState';
import {
    canonicalizeAiMerge,
    remapFieldIdsDeep,
    toMergeUrlState,
} from './canonicalizeAiMerge';

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
    it('renames sources and join keys the way the merge editor names them', () => {
        const canonical = canonicalizeAiMerge(aiMergeQuery);

        expect(canonical?.mergeQuery.sources.map((s) => s.id)).toEqual([
            'orders',
            'subscriptions',
        ]);
        expect(canonical?.mergeQuery.joinKey).toEqual([
            {
                name: 'orders_order_date_month',
                fieldIdBySourceId: {
                    orders: 'orders_order_date_month',
                    subscriptions: 'subscriptions_subscription_start_month',
                },
            },
        ]);
        expect(canonical?.fieldIdByAiFieldId).toEqual({
            merge_month: 'merge_orders_order_date_month',
            orders_orders_total_order_amount:
                'orders_orders_total_order_amount',
            subs_subscriptions_total_monthly_mrr:
                'subscriptions_subscriptions_total_monthly_mrr',
        });
    });

    it('serializes into merge URL state the editor parses back', () => {
        const canonical = canonicalizeAiMerge(aiMergeQuery);
        if (!canonical) throw new Error('expected a canonical merge');

        const parsed = parseMergeState(
            serializeMergeState(toMergeUrlState(canonical)),
        );

        expect(parsed).toEqual({
            focus: { kind: 'source', sourceId: 'a' },
            primarySourceName: null,
            additionalSources: [
                {
                    id: 'b',
                    name: 'subscriptions',
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
            repeatValuesSourceIds: [],
            tableCalculations: [],
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
            yAxisMetrics: ['orders_orders_total_order_amount'],
            merge_orders_order_date_month: {
                label: 'Month, including merge_month text',
            },
        });
    });
});
