import {
    MergeJoinType,
    upgradeSavedMergeQuery,
    type SavedMergeDefinition,
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

    it('restores every query of a merge over more than two sources', () => {
        const query = (explore: string) => ({
            explore,
            dimensions: [`${explore}_week`],
            metrics: [`${explore}_score`],
        });
        const merge: SavedMergeDefinition = {
            queries: {
                calls: query('calls'),
                complaints: { ...query('complaints'), repeat: true },
                calls_2: query('calls'),
            },
            join: MergeJoinType.FULL,
            keys: {
                orders_week: [
                    'calls.calls_week',
                    'complaints.complaints_week',
                    'calls_2.calls_week',
                ],
            },
            limit: 500,
        };
        const restored = restoreSavedMerge(merge);
        expect(
            restored?.additionalSources.map(({ id, name }) => [id, name]),
        ).toEqual([
            ['b', 'calls'],
            ['source_2', 'complaints'],
            ['source_3', 'calls_2'],
        ]);
        expect(restored?.joinParts).toEqual([
            {
                fieldIdBySourceId: {
                    a: 'orders_week',
                    b: 'calls_week',
                    source_2: 'complaints_week',
                    source_3: 'calls_week',
                },
            },
        ]);
        expect(restored?.repeatValuesSourceIds).toEqual(['source_2']);
    });
});
