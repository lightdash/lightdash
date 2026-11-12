import {
    MergeJoinType,
    QuerySourceType,
    type MergeSourceQuery,
    type SavedChart,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    MERGE_URL_PARAM,
    parseMergeState,
} from '../../../../../../../features/mergeQuery/context/mergeUrlState';
import { getNodeExploreUrl } from './useExploreFromHere';

const semantic = (
    nodeId: string,
    exploreName: string,
): SemanticLayerSourceQuery => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId,
    exploreName,
    dimensions: [`${exploreName}_partner`],
    metrics: [`${exploreName}_count`],
    parameters: { quarter: 'Q3' },
});

const calc = {
    name: 'per_order',
    displayName: 'Tickets per order',
    sql: '',
    formula: '=${tickets_q3_tickets_count} / ${orders_q3_orders_count}',
};

// Not the terminal node: a later step reads it.
const merge: MergeSourceQuery = {
    sourceType: QuerySourceType.MERGE,
    nodeId: 'partner_activity',
    sources: [{ nodeId: 'orders_q3' }, { nodeId: 'tickets_q3' }],
    joinKey: [
        {
            name: 'partner',
            fieldIdBySourceId: {
                orders_q3: 'orders_partner',
                tickets_q3: 'tickets_partner',
            },
        },
    ],
    joinType: MergeJoinType.LEFT,
    tableCalculations: [calc],
    sorts: [{ fieldId: 'merge_per_order', descending: true }],
};

describe('getNodeExploreUrl', () => {
    it('opens a merge step as an Explorer merge with every source, the key, join, calculation and sort', () => {
        const url = getNodeExploreUrl(
            merge,
            [
                semantic('orders_q3', 'orders'),
                semantic('tickets_q3', 'tickets'),
            ],
            'project-uuid',
        )!();
        const params = new URLSearchParams(url.search);

        expect(url.pathname).toBe('/projects/project-uuid/tables/orders');
        const chart = JSON.parse(
            params.get('create_saved_chart_version')!,
        ) as SavedChart;
        expect(chart.metricQuery.sorts).toEqual([
            { fieldId: 'merge_per_order', descending: true },
        ]);
        expect(chart.parameters).toEqual({ quarter: 'Q3' });
        const state = parseMergeState(params.get(MERGE_URL_PARAM))!;
        expect(state).toMatchObject({
            primarySourceName: 'orders_q3',
            additionalSources: [{ name: 'tickets_q3', exploreName: 'tickets' }],
            joinType: MergeJoinType.LEFT,
            tableCalculations: [calc],
        });
        expect(state.joinParts).toEqual([
            {
                name: 'partner',
                fieldIdBySourceId: {
                    a: 'orders_partner',
                    [state.additionalSources[0].id]: 'tickets_partner',
                },
            },
        ]);
    });

    it('offers no Explore for a merge reading a step the Explorer cannot query', () => {
        expect(
            getNodeExploreUrl(
                merge,
                [
                    semantic('orders_q3', 'orders'),
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'tickets_q3',
                        sql: 'select 1',
                    },
                ],
                'project-uuid',
            ),
        ).toBeNull();
    });
});
