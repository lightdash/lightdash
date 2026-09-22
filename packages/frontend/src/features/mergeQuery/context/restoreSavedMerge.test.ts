import {
    MergeJoinType,
    upgradeSavedMergeQuery,
    type SavedMergeQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { restoreSavedMerge } from './restoreSavedMerge';

const savedV2: SavedMergeQuery = {
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
    repeatValuesSourceIds: ['subscriptions'],
};
const chart = {
    exploreName: 'orders',
    dimensions: ['orders_month'],
    metrics: ['orders_total'],
    filters: {},
    tableCalculations: [],
    sorts: [],
    limit: 500,
};

describe('restoreSavedMerge', () => {
    // The API rewrites older rows to a merge; a browser holding an older
    // response sees no merge rather than a broken one
    it('ignores a cached merge in an older shape', () => {
        expect(restoreSavedMerge(savedV2)).toBeNull();
        expect(
            restoreSavedMerge({
                secondQuery: { metricQuery: { exploreName: 'subscriptions' } },
            }),
        ).toBeNull();
    });

    it('restores the stored merge', () => {
        expect(
            restoreSavedMerge(upgradeSavedMergeQuery(savedV2, chart)),
        ).toEqual({
            // Editor handles, with the saved names riding along so the
            // chart's column ids hold
            focus: { kind: 'source', sourceId: 'a' },
            // Saved under its explore's name, so nothing to fix
            primarySourceName: null,
            additionalSources: [
                {
                    id: 'b',
                    name: 'subscriptions',
                    exploreName: 'subscriptions',
                    dimensions: ['subscriptions_month'],
                    metrics: ['subscriptions_mrr'],
                    filters: {},
                    additionalMetrics: undefined,
                    customDimensions: undefined,
                },
            ],
            joinParts: [
                {
                    name: 'month',
                    fieldIdBySourceId: {
                        a: 'orders_month',
                        b: 'subscriptions_month',
                    },
                },
            ],
            joinType: MergeJoinType.FULL,
            repeatValuesSourceIds: ['b'],
            tableCalculations: [],
        });
    });

    // The editor edits the merge around the chart's own query
    it('refuses a merge whose left-join primary is not the chart query', () => {
        expect(
            restoreSavedMerge(
                upgradeSavedMergeQuery(
                    { ...savedV2, primarySourceId: 'subscriptions' },
                    chart,
                ),
            ),
        ).toBeNull();
    });
});
